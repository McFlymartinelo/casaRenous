import * as THREE from "three"

const DEG = Math.PI / 180

export interface SunState {
  direction: [number, number, number]
  elevation: number
  daylight: number
  intensity: number
  color: THREE.Color
  skyTint: THREE.Color
  horizonTint: THREE.Color
  environmentIntensity: number
  lampIntensity: number
  isNight: boolean
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Position solaire approchée (Nord 47°). x = est, z = nord, y = hauteur.
 * Le soleil est au sud à midi, à l'est le matin et à l'ouest le soir.
 */
export function sunState(hour: number, latitude = 47.2, dayOfYear = 172): SunState {
  const declination = 23.44 * DEG * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365)
  const hourAngle = (hour - 12) * 15 * DEG
  const lat = latitude * DEG
  const sinElevation =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  const elevation = Math.asin(Math.min(1, Math.max(-1, sinElevation)))
  const cosElevation = Math.max(0.001, Math.cos(elevation))
  const direction: [number, number, number] = [
    -Math.sin(hourAngle) * cosElevation,
    Math.sin(elevation),
    -Math.cos(hourAngle) * cosElevation,
  ]

  const daylight = smoothstep(-0.06, 0.22, Math.sin(elevation))
  const intensity = Math.max(0, Math.sin(elevation)) ** 0.55 * 5.2
  const warm = new THREE.Color("#ff9b57")
  const noon = new THREE.Color("#fff7e8")
  const mix = smoothstep(0.02, 0.95, Math.sin(elevation))
  const color = warm.clone().lerp(noon, mix)

  const skyNight = new THREE.Color("#1b2633")
  const skyDay = new THREE.Color("#dce9f2")
  const horizonNight = new THREE.Color("#323c47")
  const horizonDay = new THREE.Color("#f7e8d2")

  return {
    direction,
    elevation: elevation / DEG,
    daylight,
    intensity,
    color,
    skyTint: skyNight.clone().lerp(skyDay, daylight),
    horizonTint: horizonNight.clone().lerp(horizonDay, daylight),
    environmentIntensity: 0.07 + daylight * 0.25,
    lampIntensity: (1 - daylight) * 7 + 0.6,
    isNight: daylight < 0.08,
  }
}

export function formatHour(hour: number): string {
  const whole = Math.floor(hour)
  const minutes = Math.round((hour - whole) * 60)
  return minutes === 0 ? `${whole} h` : `${whole} h ${String(minutes).padStart(2, "0")}`
}

export function timeOfDay(hour: number): string {
  if (hour < 6) return "nuit"
  if (hour < 9) return "matin"
  if (hour < 12) return "matinée"
  if (hour < 14) return "midi"
  if (hour < 18) return "après-midi"
  if (hour < 21) return "soir"
  return "nuit"
}
