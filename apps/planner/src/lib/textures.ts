import * as THREE from "three"
import type { TextureKind } from "@/types"

interface SurfaceTextures {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

const cache = new Map<TextureKind, SurfaceTextures>()
const SIZE = 512

function seeded(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createCanvas(size = SIZE): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  return canvas
}

function noiseCanvas(size: number, seed: number, alpha = 1): HTMLCanvasElement {
  const canvas = createCanvas(size)
  const context = canvas.getContext("2d") as CanvasRenderingContext2D
  const image = context.createImageData(size, size)
  const random = seeded(seed)
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 215 + Math.floor(random() * 40)
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
    image.data[index + 3] = Math.round(255 * alpha)
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function overlayNoise(
  context: CanvasRenderingContext2D,
  size: number,
  seed: number,
  alpha: number,
  scale = 4,
): void {
  const small = noiseCanvas(Math.max(8, Math.floor(size / scale)), seed)
  context.save()
  context.globalAlpha = alpha
  context.globalCompositeOperation = "soft-light"
  context.imageSmoothingEnabled = true
  context.drawImage(small, 0, 0, size, size)
  context.restore()
}

function drawWood(context: CanvasRenderingContext2D, size: number): void {
  const random = seeded(11)
  const plank = size / 6
  for (let column = 0; column < 6; column += 1) {
    const base = 214 + Math.floor(random() * 32)
    context.fillStyle = `rgb(${base},${base - 6},${base - 14})`
    context.fillRect(column * plank, 0, plank, size)
    // grain
    for (let line = 0; line < 26; line += 1) {
      const x = column * plank + random() * plank
      const amplitude = 1 + random() * 5
      const shade = 180 + Math.floor(random() * 55)
      context.strokeStyle = `rgba(${shade},${shade - 12},${shade - 24},${0.05 + random() * 0.16})`
      context.lineWidth = 0.6 + random() * 1.6
      context.beginPath()
      context.moveTo(x, 0)
      for (let y = 0; y <= size; y += 16) {
        context.lineTo(x + Math.sin(y * 0.03 + random() * 0.2) * amplitude, y)
      }
      context.stroke()
    }
    // joints
    const joint = Math.floor(random() * size)
    context.strokeStyle = "rgba(105,92,76,0.34)"
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(column * plank, joint)
    context.lineTo((column + 1) * plank, joint)
    context.stroke()
    context.strokeStyle = "rgba(95,83,68,0.38)"
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(column * plank, 0)
    context.lineTo(column * plank, size)
    context.stroke()
    // highlight along seam
    context.strokeStyle = "rgba(255,250,240,0.16)"
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(column * plank + 1.5, 0)
    context.lineTo(column * plank + 1.5, size)
    context.stroke()
  }
  overlayNoise(context, size, 21, 0.35, 5)
}

function drawTile(context: CanvasRenderingContext2D, size: number): void {
  const random = seeded(31)
  const tiles = 4
  const step = size / tiles
  context.fillStyle = "#d8d4cb"
  context.fillRect(0, 0, size, size)
  for (let y = 0; y < tiles; y += 1) {
    for (let x = 0; x < tiles; x += 1) {
      const tone = 224 + Math.floor(random() * 22)
      context.fillStyle = `rgb(${tone},${tone - 2},${tone - 7})`
      context.fillRect(x * step + 3, y * step + 3, step - 6, step - 6)
      for (let speck = 0; speck < 34; speck += 1) {
        const alpha = 0.03 + random() * 0.1
        context.fillStyle = `rgba(130,124,112,${alpha})`
        context.beginPath()
        context.arc(x * step + random() * step, y * step + random() * step, 0.6 + random() * 1.6, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
  context.strokeStyle = "rgba(126,121,112,0.5)"
  context.lineWidth = 4
  for (let index = 0; index <= tiles; index += 1) {
    context.beginPath()
    context.moveTo(index * step, 0)
    context.lineTo(index * step, size)
    context.moveTo(0, index * step)
    context.lineTo(size, index * step)
    context.stroke()
  }
  context.strokeStyle = "rgba(255,255,250,0.28)"
  context.lineWidth = 1.4
  for (let index = 0; index <= tiles; index += 1) {
    context.beginPath()
    context.moveTo(index * step + 3, 0)
    context.lineTo(index * step + 3, size)
    context.moveTo(0, index * step + 3)
    context.lineTo(size, index * step + 3)
    context.stroke()
  }
  overlayNoise(context, size, 41, 0.28, 6)
}

function drawPlaster(context: CanvasRenderingContext2D, size: number): void {
  context.fillStyle = "#f1eee8"
  context.fillRect(0, 0, size, size)
  overlayNoise(context, size, 51, 0.38, 3)
  const random = seeded(52)
  for (let index = 0; index < 90; index += 1) {
    const x = random() * size
    const y = random() * size
    const radius = 8 + random() * 34
    context.strokeStyle = `rgba(190,184,174,${0.025 + random() * 0.05})`
    context.lineWidth = 1 + random() * 3
    context.beginPath()
    context.arc(x, y, radius, random() * Math.PI, random() * Math.PI + 1.2)
    context.stroke()
  }
}

function drawConcrete(context: CanvasRenderingContext2D, size: number): void {
  context.fillStyle = "#b9b8b3"
  context.fillRect(0, 0, size, size)
  overlayNoise(context, size, 61, 0.55, 2)
  overlayNoise(context, size, 62, 0.28, 10)
  const random = seeded(63)
  for (let index = 0; index < 220; index += 1) {
    context.fillStyle = `rgba(90,90,88,${0.02 + random() * 0.08})`
    context.beginPath()
    context.arc(random() * size, random() * size, 0.5 + random() * 2.2, 0, Math.PI * 2)
    context.fill()
  }
}

function drawStone(context: CanvasRenderingContext2D, size: number): void {
  context.fillStyle = "#e6dfd2"
  context.fillRect(0, 0, size, size)
  overlayNoise(context, size, 71, 0.4, 4)
  const random = seeded(72)
  for (let index = 0; index < 16; index += 1) {
    context.strokeStyle = `rgba(150,141,125,${0.05 + random() * 0.1})`
    context.lineWidth = 0.7 + random() * 2
    context.beginPath()
    let x = random() * size
    let y = random() * size
    context.moveTo(x, y)
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 80
      y += (random() - 0.5) * 80
      context.lineTo(x, y)
    }
    context.stroke()
  }
}

function drawMarble(context: CanvasRenderingContext2D, size: number): void {
  const random = seeded(121)
  context.fillStyle = "#f4f1ea"
  context.fillRect(0, 0, size, size)

  // Nuages de matière, très diffus, pour éviter un fond uniforme.
  for (let index = 0; index < 16; index += 1) {
    const x = random() * size
    const y = random() * size
    const radius = size * (0.08 + random() * 0.2)
    const warm = random() > 0.76
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, warm ? "rgba(191,161,113,0.09)" : "rgba(142,143,138,0.09)")
    gradient.addColorStop(1, "rgba(255,255,255,0)")
    context.fillStyle = gradient
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  const flow = -0.38
  const vein = (width: number, color: string, alpha: number, jitter: number, angle: number) => {
    let x = random() * size
    let y = random() * size
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const steps = 9 + Math.floor(random() * 5)
    const stride = (size * 1.75) / steps
    context.beginPath()
    context.moveTo(x, y)
    for (let step = 0; step < steps; step += 1) {
      x += dx * stride + (random() - 0.5) * jitter
      y += dy * stride + (random() - 0.5) * jitter
      context.lineTo(x, y)
    }
    context.strokeStyle = color
    context.lineWidth = width
    context.globalAlpha = alpha
    context.lineCap = "round"
    context.lineJoin = "round"
    context.stroke()
    context.globalAlpha = 1
  }

  // Veines larges, gris chaud, puis veines fines et filets dorés.
  for (let index = 0; index < 9; index += 1) {
    vein(6 + random() * 13, "rgba(126,124,117,1)", 0.09 + random() * 0.08, size * 0.075, flow + (random() - 0.5) * 0.22)
  }
  for (let index = 0; index < 16; index += 1) {
    vein(1 + random() * 2.6, "rgba(92,90,85,1)", 0.16 + random() * 0.15, size * 0.06, flow + (random() - 0.5) * 0.34)
  }
  for (let index = 0; index < 7; index += 1) {
    vein(2.5 + random() * 6, "rgba(169,130,74,1)", 0.17 + random() * 0.13, size * 0.065, flow + (random() - 0.5) * 0.28)
  }
  for (let index = 0; index < 14; index += 1) {
    vein(0.5 + random() * 1.1, "rgba(132,128,119,1)", 0.18 + random() * 0.14, size * 0.045, flow + (random() - 0.5) * 0.5)
  }
  overlayNoise(context, size, 122, 0.12, 8)
}

function drawFabric(context: CanvasRenderingContext2D, size: number): void {
  context.fillStyle = "#f0ece5"
  context.fillRect(0, 0, size, size)
  context.globalAlpha = 0.16
  context.strokeStyle = "#a9a196"
  for (let index = 0; index < size; index += 3) {
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(index, 0)
    context.lineTo(index, size)
    context.stroke()
    context.beginPath()
    context.moveTo(0, index)
    context.lineTo(size, index)
    context.stroke()
  }
  context.globalAlpha = 1
  overlayNoise(context, size, 81, 0.3, 2)
}

function drawGrass(context: CanvasRenderingContext2D, size: number): void {
  // Fond dégradé : la pelouse n'est jamais parfaitement uniforme.
  const base = context.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, "#cbd6b6")
  base.addColorStop(0.5, "#c2cead")
  base.addColorStop(1, "#ccd7b9")
  context.fillStyle = base
  context.fillRect(0, 0, size, size)

  // Légères bandes de tonte, très diffuses.
  context.save()
  context.globalAlpha = 0.09
  for (let band = 0; band < 6; band += 1) {
    context.fillStyle = band % 2 ? "#8fa377" : "#dbe4cb"
    context.fillRect((band * size) / 6, 0, size / 6, size)
  }
  context.restore()

  const random = seeded(91)
  // Touffes plus sombres, puis brins.
  for (let tuft = 0; tuft < 90; tuft += 1) {
    const x = random() * size
    const y = random() * size
    const radius = 10 + random() * 28
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    const dark = random() > 0.4
    gradient.addColorStop(0, dark ? "rgba(74,96,58,0.13)" : "rgba(224,231,199,0.16)")
    gradient.addColorStop(1, "rgba(255,255,255,0)")
    context.fillStyle = gradient
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  for (let index = 0; index < 5200; index += 1) {
    const x = random() * size
    const y = random() * size
    const tone = 152 + Math.floor(random() * 76)
    context.strokeStyle = `rgba(${tone - 22},${tone},${tone - 58},${0.12 + random() * 0.38})`
    context.lineWidth = 0.5 + random() * 1.1
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (random() - 0.5) * 4, y - 2 - random() * 6)
    context.stroke()
  }
  // Quelques pâquerettes / trèfles ponctuels.
  for (let flower = 0; flower < 26; flower += 1) {
    const x = random() * size
    const y = random() * size
    context.fillStyle = random() > 0.6 ? "rgba(238,230,198,0.7)" : "rgba(226,206,132,0.6)"
    context.beginPath()
    context.arc(x, y, 0.8 + random() * 1.4, 0, Math.PI * 2)
    context.fill()
  }
  overlayNoise(context, size, 92, 0.2, 8)
}

function drawBark(context: CanvasRenderingContext2D, size: number): void {
  const random = seeded(141)
  context.fillStyle = "#6b5742"
  context.fillRect(0, 0, size, size)

  // Larges bandes verticales : alternance de crêtes et de sillons.
  for (let band = 0; band < 26; band += 1) {
    const x = (band / 26) * size + (random() - 0.5) * 10
    const width = size / 26 + random() * 9
    const light = random() > 0.45
    const gradient = context.createLinearGradient(x, 0, x + width, 0)
    gradient.addColorStop(0, light ? "rgba(150,127,98,0.42)" : "rgba(58,45,34,0.5)")
    gradient.addColorStop(0.45, light ? "rgba(122,101,77,0.2)" : "rgba(74,58,43,0.25)")
    gradient.addColorStop(1, light ? "rgba(58,45,34,0.38)" : "rgba(150,127,98,0.3)")
    context.fillStyle = gradient
    context.fillRect(x, 0, width, size)
  }

  // Fissures irrégulières, plus denses vers le bas.
  for (let line = 0; line < 190; line += 1) {
    let x = random() * size
    const yStart = random() * size
    const length = 18 + random() * 130
    context.strokeStyle = `rgba(38,29,21,${0.08 + random() * 0.24})`
    context.lineWidth = 0.6 + random() * 2.2
    context.beginPath()
    context.moveTo(x, yStart)
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 9
      context.lineTo(x, yStart + (step + 1) * (length / 6))
    }
    context.stroke()
  }

  // Éclats clairs pour casser la régularité.
  for (let index = 0; index < 420; index += 1) {
    const tone = 150 + Math.floor(random() * 60)
    context.fillStyle = `rgba(${tone},${tone - 18},${tone - 36},${0.04 + random() * 0.12})`
    context.fillRect(random() * size, random() * size, 1 + random() * 3, 3 + random() * 14)
  }
  overlayNoise(context, size, 142, 0.26, 4)
}

function normalMapFromCanvas(source: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = source.width
  const context = source.getContext("2d") as CanvasRenderingContext2D
  const pixels = context.getImageData(0, 0, size, size).data
  const target = createCanvas(size)
  const targetContext = target.getContext("2d") as CanvasRenderingContext2D
  const image = targetContext.createImageData(size, size)
  const height = (x: number, y: number): number => {
    const px = (Math.min(size - 1, Math.max(0, x)) + Math.min(size - 1, Math.max(0, y)) * size) * 4
    return pixels[px] ?? 128
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (height(x + 1, y) - height(x - 1, y)) / 255
      const dy = (height(x, y + 1) - height(x, y - 1)) / 255
      const nx = -dx * strength
      const ny = dy * strength
      const nz = 1
      const length = Math.hypot(nx, ny, nz)
      const index = (x + y * size) * 4
      image.data[index] = Math.round((nx / length) * 127.5 + 127.5)
      image.data[index + 1] = Math.round((ny / length) * 127.5 + 127.5)
      image.data[index + 2] = Math.round((nz / length) * 127.5 + 127.5)
      image.data[index + 3] = 255
    }
  }
  targetContext.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(target)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function roughnessFromCanvas(source: HTMLCanvasElement): THREE.CanvasTexture {
  const size = source.width
  const context = source.getContext("2d") as CanvasRenderingContext2D
  const pixels = context.getImageData(0, 0, size, size).data
  const target = createCanvas(size)
  const targetContext = target.getContext("2d") as CanvasRenderingContext2D
  const image = targetContext.createImageData(size, size)
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 205 + Math.round((pixels[index] ?? 128) * 0.14)
    image.data[index] = value
    image.data[index + 1] = value
    image.data[index + 2] = value
    image.data[index + 3] = 255
  }
  targetContext.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(target)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export function getSurfaceTextures(kind: TextureKind): SurfaceTextures | null {
  if (kind === "metal") return null
  const cached = cache.get(kind)
  if (cached) return cached

  const canvas = createCanvas()
  const context = canvas.getContext("2d") as CanvasRenderingContext2D
  let normalStrength = 2
  switch (kind) {
    case "wood":
      drawWood(context, SIZE)
      normalStrength = 4
      break
    case "tile":
      drawTile(context, SIZE)
      normalStrength = 5
      break
    case "plaster":
      drawPlaster(context, SIZE)
      normalStrength = 1.5
      break
    case "concrete":
      drawConcrete(context, SIZE)
      normalStrength = 2.5
      break
    case "stone":
      drawStone(context, SIZE)
      normalStrength = 2
      break
    case "marble":
      drawMarble(context, SIZE)
      normalStrength = 1.4
      break
    case "fabric":
      drawFabric(context, SIZE)
      normalStrength = 1.2
      break
    case "grass":
      drawGrass(context, SIZE)
      normalStrength = 3
      break
    case "bark":
      drawBark(context, SIZE)
      normalStrength = 5
      break
  }

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.needsUpdate = true

  const textures: SurfaceTextures = {
    map,
    normalMap: normalMapFromCanvas(canvas, normalStrength),
    roughnessMap: roughnessFromCanvas(canvas),
  }
  cache.set(kind, textures)
  return textures
}
