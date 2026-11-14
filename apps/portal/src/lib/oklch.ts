interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

function parseOklch(value: string): Oklch | null {
  const match = value
    .trim()
    .match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+%?)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i)
  if (!match) return null
  const lRaw = Number(match[1])
  const l = match[1]?.includes("%") || lRaw > 1 ? lRaw / 100 : lRaw
  const cRaw = Number(match[2])
  const c = match[2]?.includes("%") ? cRaw / 100 : cRaw
  const h = Number(match[3])
  const alphaRaw = match[4]
  const alpha = alphaRaw
    ? alphaRaw.includes("%")
      ? Number(alphaRaw.replace("%", "")) / 100
      : Number(alphaRaw)
    : 1
  if (![l, c, h, alpha].every(Number.isFinite)) return null
  return { l, c, h, alpha }
}

function linearToSrgb(value: number): number {
  if (value <= 0.0031308) return 12.92 * value
  return 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

function channelToHex(value: number): string {
  const clamped = Math.max(0, Math.min(1, linearToSrgb(value)))
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
}

export function oklchToHex(value: string): string | null {
  const oklch = parseOklch(value)
  if (!oklch) return null
  const hRad = (oklch.h * Math.PI) / 180
  const a = oklch.c * Math.cos(hRad)
  const b = oklch.c * Math.sin(hRad)

  const l = oklch.l + 0.3963377774 * a + 0.2158037573 * b
  const m = oklch.l - 0.1055613458 * a - 0.0638541728 * b
  const s = oklch.l - 0.0894841775 * a - 1.291485548 * b

  const L = l ** 3
  const M = m ** 3
  const S = s ** 3

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
  const blue = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S

  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(blue)}`
}

export function readTokenColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return oklchToHex(fallback) ?? "#000000"
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return oklchToHex(raw) ?? oklchToHex(fallback) ?? "#000000"
}
