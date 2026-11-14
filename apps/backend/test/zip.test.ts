import { describe, expect, it } from "vitest"
import { crc32, zipStream, type ZipEntry } from "../src/lib/zip.js"

async function collect(entries: ZipEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of zipStream(
    (async function* () {
      yield* entries
    })(),
  )) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Relit l'archive via son répertoire central, comme le ferait un dézippeur. */
function readEntries(zip: Buffer): { name: string; crc: number; data: Buffer }[] {
  const eocd = zip.length - 22
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50)
  const count = zip.readUInt16LE(eocd + 10)
  const centralOffset = zip.readUInt32LE(eocd + 16)
  const centralSize = zip.readUInt32LE(eocd + 12)
  expect(centralOffset + centralSize).toBe(eocd)

  let cursor = centralOffset
  const entries: { name: string; crc: number; data: Buffer }[] = []
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50)
    const crc = zip.readUInt32LE(cursor + 16)
    const size = zip.readUInt32LE(cursor + 24)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8")

    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50)
    // Pas de data descriptor : les tailles/CRC sont dans l'en-tête local,
    // ce que les dézippeurs stricts (Explorateur Windows) attendent.
    expect(zip.readUInt16LE(localOffset + 6) & 0x0008).toBe(0)
    expect(zip.readUInt32LE(localOffset + 14)).toBe(crc)
    expect(zip.readUInt32LE(localOffset + 18)).toBe(size)
    expect(zip.readUInt32LE(localOffset + 22)).toBe(size)
    const localNameLength = zip.readUInt16LE(localOffset + 26)
    const localExtraLength = zip.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    entries.push({ name, crc, data: zip.subarray(dataStart, dataStart + size) })

    cursor += 46 + nameLength + extraLength + commentLength
  }
  expect(cursor).toBe(eocd)
  return entries
}

describe("zip", () => {
  it("calcule le CRC32 de référence", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926)
  })

  it("produit une archive relisible avec en-têtes, données et répertoire central", async () => {
    const zip = await collect([
      { name: "journal.csv", data: Buffer.from("Fichier;Date\r\n", "utf8") },
      { name: "photos/2026-11-13-fondations.jpg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
    ])

    expect(zip.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04")
    expect(zip.subarray(-22, -18).toString("latin1")).toBe("PK\x05\x06")

    const entries = readEntries(zip)
    expect(entries.map((entry) => entry.name)).toEqual([
      "journal.csv",
      "photos/2026-11-13-fondations.jpg",
    ])
    expect(entries[0]?.data.toString("utf8")).toBe("Fichier;Date\r\n")
    expect(entries[1]?.data).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
    for (const entry of entries) {
      expect(crc32(entry.data)).toBe(entry.crc)
    }
  })

  it("reste correct avec un nom accentué (UTF-8)", async () => {
    const zip = await collect([{ name: "photos/cuisine-été.jpg", data: Buffer.from("x") }])
    expect(readEntries(zip).map((entry) => entry.name)).toEqual(["photos/cuisine-été.jpg"])
  })

  it("accepte un journal volumineux sans casser les offsets", async () => {
    const big = Buffer.alloc(200_000, 3)
    const zip = await collect([
      { name: "a.jpg", data: big },
      { name: "b.jpg", data: big },
    ])
    const entries = readEntries(zip)
    expect(entries).toHaveLength(2)
    expect(entries[1]?.data.length).toBe(200_000)
    expect(crc32(entries[1]?.data ?? Buffer.alloc(0))).toBe(entries[1]?.crc)
  })
})
