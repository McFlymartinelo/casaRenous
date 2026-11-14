/**
 * Écriture ZIP minimale, sans dépendance, en méthode « stored » : les JPEG
 * sont déjà compressés, donc les recompresser ne gagne rien et coûte du CPU.
 * Les entrées sont produites une par une pour ne jamais garder tout le
 * journal en mémoire (les photos sont déchiffrées à la volée).
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

const VERSION = 20
const FLAG_UTF8 = 0x0800
const METHOD_STORED = 0
const LOCAL_HEADER_SIZE = 30
const CENTRAL_HEADER_SIZE = 46
const END_OF_CENTRAL_DIRECTORY_SIZE = 22

/** Taille maximale d'un ZIP classique (sans extension ZIP64). */
export const ZIP32_MAX_BYTES = 0xfffffff0
export const ZIP32_MAX_ENTRIES = 0xffff

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index] ?? 0
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Chemin dans l'archive, séparateurs `/`. */
  name: string
  data: Buffer
  date?: Date
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  }
}

function localHeader(
  name: Buffer,
  crc: number,
  size: number,
  time: number,
  date: number,
): Buffer {
  const header = Buffer.alloc(LOCAL_HEADER_SIZE)
  header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0)
  header.writeUInt16LE(VERSION, 4)
  header.writeUInt16LE(FLAG_UTF8, 6)
  header.writeUInt16LE(METHOD_STORED, 8)
  header.writeUInt16LE(time, 10)
  header.writeUInt16LE(date, 12)
  header.writeUInt32LE(crc, 14)
  header.writeUInt32LE(size, 18)
  header.writeUInt32LE(size, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  return header
}

function centralHeader(
  name: Buffer,
  crc: number,
  size: number,
  offset: number,
  time: number,
  date: number,
): Buffer {
  const header = Buffer.alloc(CENTRAL_HEADER_SIZE)
  header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0)
  header.writeUInt16LE(VERSION, 4)
  header.writeUInt16LE(VERSION, 6)
  header.writeUInt16LE(FLAG_UTF8, 8)
  header.writeUInt16LE(METHOD_STORED, 10)
  header.writeUInt16LE(time, 12)
  header.writeUInt16LE(date, 14)
  header.writeUInt32LE(crc, 16)
  header.writeUInt32LE(size, 20)
  header.writeUInt32LE(size, 24)
  header.writeUInt16LE(name.length, 28)
  header.writeUInt16LE(0, 30) // extra
  header.writeUInt16LE(0, 32) // commentaire
  header.writeUInt16LE(0, 34) // disque
  header.writeUInt16LE(0, 36) // attributs internes
  header.writeUInt32LE(0, 38) // attributs externes
  header.writeUInt32LE(offset, 42)
  return header
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const footer = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_SIZE)
  footer.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  footer.writeUInt16LE(0, 4) // numéro de ce disque
  footer.writeUInt16LE(0, 6) // disque du répertoire central
  footer.writeUInt16LE(count, 8)
  footer.writeUInt16LE(count, 10)
  footer.writeUInt32LE(size, 12)
  footer.writeUInt32LE(offset, 16)
  footer.writeUInt16LE(0, 20) // longueur du commentaire
  return footer
}

/**
 * Transforme une suite d'entrées en flux de buffers ZIP. Le consommateur
 * écrit les buffers au fur et à mesure (backpressure gérée par `pipeline`).
 */
export async function* zipStream(
  entries: AsyncIterable<ZipEntry>,
): AsyncGenerator<Buffer, void, unknown> {
  const central: Buffer[] = []
  let offset = 0
  let count = 0

  for await (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8")
    const { time, date } = dosDateTime(entry.date ?? new Date())
    const crc = crc32(entry.data)
    const size = entry.data.length

    const header = localHeader(name, crc, size, time, date)
    yield header
    yield name
    yield entry.data

    central.push(
      Buffer.concat([centralHeader(name, crc, size, offset, time, date), name]),
    )
    offset += LOCAL_HEADER_SIZE + name.length + size
    count += 1

    if (count > ZIP32_MAX_ENTRIES || offset > ZIP32_MAX_BYTES) {
      throw new Error("Archive trop volumineuse pour un ZIP classique")
    }
  }

  const centralOffset = offset
  let centralSize = 0
  for (const chunk of central) {
    yield chunk
    centralSize += chunk.length
  }
  if (centralOffset + centralSize > ZIP32_MAX_BYTES) {
    throw new Error("Archive trop volumineuse pour un ZIP classique")
  }

  yield endOfCentralDirectory(count, centralSize, centralOffset)
}
