/** Helpers partagés par les importeurs API.SH (Leroy Merlin, Boulanger, Amazon). */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export function findApiKey(roots) {
  if (process.env.APISH_KEY) return process.env.APISH_KEY.trim()
  for (const root of roots) {
    const file = path.join(root, ".env")
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?APISH_KEY\s*=\s*(.+?)\s*$/)
      if (match) return match[1].replace(/^["']|["']$/g, "")
    }
  }
  return null
}

export async function apiGet(platform, endpoint, params, key, base = "https://api.api.sh") {
  const url = new URL(`/${platform}/v1/${endpoint}`, base)
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
  const response = await fetch(url, {
    headers: { "x-api-key": key, accept: "application/json" },
  })
  const text = await response.text()
  if (!response.ok) {
    if (response.status === 401) throw new Error("Clé API.SH invalide ou absente (401)")
    if (response.status === 429) throw new Error("Quota API.SH épuisé (429)")
    throw new Error(`API.SH ${response.status} sur ${endpoint} : ${text.slice(0, 160)}`)
  }
  const data = JSON.parse(text)
  return { data, credits: data.credits_used ?? 0 }
}

/** Cache local des réponses pour ne pas reconsommer de crédits à chaque essai. */
export async function cached(key, fetcher, cacheDir, force = false) {
  const file = path.join(cacheDir, `${createHash("sha1").update(key).digest("hex")}.json`)
  if (!force && existsSync(file)) {
    try {
      return { value: JSON.parse(await readFile(file, "utf8")), fromCache: true }
    } catch {
      /* cache corrompu */
    }
  }
  const value = await fetcher()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(file, JSON.stringify(value), "utf8")
  return { value, fromCache: false }
}

/** "80 cm", "1,2 m", "1200 mm", "23.6 inches" -> mètres. */
export function parseLength(value) {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").toLowerCase()
  const match = raw.match(/([\d]+[.,]?\d*)\s*(millim[eè]tres?|mm|centim[eè]tres?|cm|pouces?|inches?|inch|"|m[eè]tres?|m)?/)
  if (!match) return null
  let n = Number(match[1].replace(",", "."))
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = match[2] || "cm"
  if (/milli|^mm/.test(unit)) n /= 1000
  else if (/pouce|inch|^"/.test(unit)) n = (n * 2.54) / 100
  else if (/^m$|m[eè]tres?/.test(unit)) {
    // déjà en mètres
  } else n /= 100
  return n <= 8 ? Math.round(n * 1000) / 1000 : null
}

/**
 * Cotes depuis une liste de {name, value}.
 * Une `longueur` est la dimension principale : elle devient la largeur de
 * l'emprise ; la `largeur` devient la profondeur.
 */
/** "35.9D x 21.2W x 11.2H centimetres", "300x300x265cm", "3W x 2.65H metres". */
function parseDimensionValue(value) {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").trim()
  const factor = /pouce|inch|"/i.test(raw)
    ? 0.0254
    : /millim|(?:^|\s)mm/i.test(raw)
      ? 0.001
      : /centim|\bcm\b/i.test(raw)
        ? 0.01
        : /metre|meter|(?:^|\s)m(?:\s|$)/i.test(raw)
          ? 1
          : 0.01
  const round = (n) => Math.round(n * 1000) / 1000
  const triple = raw.match(/([\d]+[.,]?\d*)\s*([dwlh])?\s*[x×]\s*([\d]+[.,]?\d*)\s*([dwlh])?\s*[x×]\s*([\d]+[.,]?\d*)\s*([dwlh])?/i)
  if (triple) {
    const values = [triple[1], triple[3], triple[5]].map((v) => Number(v.replace(",", ".")) * factor)
    const letters = [triple[2], triple[4], triple[6]].map((v) => (v ?? "").toUpperCase())
    let w, d, h
    if (letters.includes("H")) {
      const wi = letters.indexOf("W") >= 0 ? letters.indexOf("W") : letters.indexOf("L")
      const di = letters.indexOf("D")
      w = wi >= 0 ? values[wi] : values[0]
      d = di >= 0 ? values[di] : values[1]
      h = values[letters.indexOf("H")]
    } else {
      ;[w, d, h] = values
    }
    if ([w, d, h].every((v) => Number.isFinite(v) && v >= 0.02 && v <= 4)) {
      return { w: round(w), d: round(d), h: round(h) }
    }
  }
  return null
}

export function dimensionsFromRows(rows) {
  // Certaines fiches (Amazon) mettent les trois cotes dans une seule valeur.
  for (const row of rows ?? []) {
    if (!/dimension|taille|size/i.test(String(row?.name ?? ""))) continue
    const parsed = parseDimensionValue(row?.value)
    if (parsed) return parsed
  }

  let longueur = null
  let largeur = null
  let profondeur = null
  let hauteur = null
  for (const row of rows ?? []) {
    const name = String(row?.name ?? "").toLowerCase()
    if (/emball|colis|poids|weight|int[ée]rieur|minimum|maximum|date|r[ée]f[ée]rence/i.test(name)) continue
    const value = String(row?.value ?? "")

    const combined = value.match(/([\d]+[.,]?\d*)\s*[x×]\s*([\d]+[.,]?\d*)\s*[x×]\s*([\d]+[.,]?\d*)/i)
    if (combined && /dimension|taille|size/.test(name)) {
      const factor = /pouce|inch|"/i.test(value) ? 0.0254 : /mm|millim/i.test(value) ? 0.001 : 0.01
      const values = combined.slice(1).map((v) => Number(v.replace(",", ".")) * factor)
      if (values.every((v) => v >= 0.02 && v <= 4)) {
        return { w: Math.round(values[0] * 1000) / 1000, d: Math.round(values[1] * 1000) / 1000, h: Math.round(values[2] * 1000) / 1000 }
      }
    }

    const length = parseLength(value)
    if (length === null) continue
    if (/^longueur|length/.test(name)) longueur ??= length
    else if (/^largeur|width/.test(name)) largeur ??= length
    else if (/^profondeur|depth/.test(name)) profondeur ??= length
    else if (/^hauteur|height/.test(name)) hauteur ??= length
  }
  const w = longueur ?? largeur ?? profondeur
  const d = longueur !== null ? (largeur ?? profondeur) : (profondeur ?? largeur)
  if ([w, d, hauteur].every((v) => v !== null && v >= 0.02 && v <= 4)) {
    const round = (n) => Math.round(n * 1000) / 1000
    return { w: round(w), d: round(d), h: round(hauteur) }
  }
  return null
}

export function writeCatalog(file, entries, comment, exportName) {
  const header = [
    comment,
    'import type { CatalogItem } from "@/types"',
    "",
    `export const ${exportName}: CatalogItem[] = [`,
  ].join("\n")
  const body = entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n")
  return writeFile(file, `${header}\n${body}\n]\n`, "utf8")
}
