import type { FurnitureVariant, MaterialConfig } from "@/types"

export function fabric(color: string, sheen = 0.35): MaterialConfig {
  return {
    color,
    roughness: 0.93,
    metalness: 0,
    texture: "fabric",
    textureScale: 0.5,
    bump: 0.008,
    sheen,
  }
}

export function wood(color: string): MaterialConfig {
  return {
    color,
    roughness: 0.5,
    metalness: 0,
    texture: "wood",
    textureScale: 0.75,
    bump: 0.012,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
  }
}

export function paint(color: string, roughness = 0.62): MaterialConfig {
  return { color, roughness, metalness: 0.02 }
}

export function metal(color: string, roughness = 0.32): MaterialConfig {
  return { color, roughness, metalness: 0.92 }
}

export function ceramic(color: string): MaterialConfig {
  return {
    color,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
  }
}

export function stone(color: string): MaterialConfig {
  return {
    color,
    roughness: 0.3,
    metalness: 0.04,
    texture: "stone",
    textureScale: 1.2,
    bump: 0.006,
    clearcoat: 0.18,
    clearcoatRoughness: 0.3,
  }
}

export function marble(color: string): MaterialConfig {
  return {
    color,
    roughness: 0.26,
    metalness: 0.04,
    texture: "marble",
    textureScale: 2.4,
    bump: 0.004,
    clearcoat: 0.2,
    clearcoatRoughness: 0.28,
  }
}

export function glassMaterial(): MaterialConfig {
  return {
    color: "#d6e6e8",
    roughness: 0.05,
    metalness: 0.1,
    opacity: 0.24,
    transparent: true,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  }
}

export function screenMaterial(): MaterialConfig {
  return {
    color: "#0c0e0d",
    roughness: 0.12,
    metalness: 0.4,
    clearcoat: 0.9,
    clearcoatRoughness: 0.05,
  }
}

export function variantPalette(variant: FurnitureVariant) {
  return {
    fabric: fabric(variant.primary),
    fabricSecondary: fabric(variant.secondary),
    fabricLight: fabric(variant.secondary, 0.25),
    wood: wood(variant.wood),
    woodDark: wood(darken(variant.wood, 0.2)),
    paint: paint(variant.primary),
    paintSecondary: paint(variant.secondary),
    lacquer: {
      ...paint(variant.primary, 0.44),
      clearcoat: 0.14,
      clearcoatRoughness: 0.26,
    },
    lacquerSecondary: paint(variant.secondary, 0.5),
    plinth: paint("#9b958b", 0.66),
    whiteMatte: paint("#f2f0e9", 0.4),
    whiteMetal: metal("#deddd7", 0.38),
    glassSmoked: {
      color: "#1c1e20",
      roughness: 0.06,
      metalness: 0.22,
      opacity: 0.72,
      transparent: true,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      side: "double" as const,
    },
    marble: marble(variant.stone ?? "#e9e4d9"),
    metal: metal(variant.metal),
    metalDark: metal(darken(variant.metal, 0.25), 0.42),
    brass: metal("#a9864f", 0.4),
    white: ceramic("#f2efe8"),
    stone: stone(variant.stone ?? "#ddd8cf"),
    black: paint("#1f211f", 0.5),
    screen: screenMaterial(),
    glass: glassMaterial(),
    ceramic: ceramic(variant.primary),
    ceramicSecondary: ceramic(variant.secondary),
  }
}

export type Palette = ReturnType<typeof variantPalette>

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

export function darken(hex: string, amount: number): string {
  const value = hex.replace("#", "")
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `#${[r, g, b]
    .map((channel) => clampByte(channel * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`
}

export function lighten(hex: string, amount: number): string {
  const value = hex.replace("#", "")
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `#${[r, g, b]
    .map((channel) => clampByte(channel + (255 - channel) * amount).toString(16).padStart(2, "0"))
    .join("")}`
}
