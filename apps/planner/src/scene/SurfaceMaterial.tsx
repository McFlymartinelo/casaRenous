import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import type { MaterialConfig } from "@/types"
import { getSurfaceTextures } from "@/lib/textures"
import { usePlanner } from "@/store/planner"

function resolveUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url
  return `${import.meta.env.BASE_URL}${url.replace(/^\//, "")}`
}

function useExternalTexture(url: string | undefined, srgb = false): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!url) {
      setTexture(null)
      return
    }
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.load(
      resolveUrl(url),
      (loaded) => {
        if (cancelled) return
        loaded.wrapS = THREE.RepeatWrapping
        loaded.wrapT = THREE.RepeatWrapping
        loaded.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        loaded.anisotropy = 8
        loaded.needsUpdate = true
        setTexture(loaded)
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [url])
  return texture
}

function useRepeatedTexture(
  base: THREE.Texture | null,
  material: MaterialConfig,
  uv: [number, number] | undefined,
): THREE.Texture | null {
  return useMemo(() => {
    if (!base) return null
    const clone = base.clone()
    clone.wrapS = THREE.RepeatWrapping
    clone.wrapT = THREE.RepeatWrapping
    const scale = material.textureScale ?? 1
    const repeat: [number, number] = uv
      ? [Math.max(0.25, uv[0] / scale), Math.max(0.25, uv[1] / scale)]
      : [1, 1]
    clone.repeat.set(repeat[0], repeat[1])
    clone.needsUpdate = true
    return clone
  }, [base, material.textureScale, uv?.[0], uv?.[1]])
}

export function SurfaceMaterial({
  material,
  uv,
  envMapIntensity = 0.55,
}: {
  material: MaterialConfig
  uv?: [number, number]
  envMapIntensity?: number
}) {
  const texturesEnabled = usePlanner((state) => state.ambience.textures)
  const procedural = useMemo(
    () => (material.texture && texturesEnabled ? getSurfaceTextures(material.texture) : null),
    [material.texture, texturesEnabled],
  )
  const externalMap = useExternalTexture(material.textures?.map, true)
  const externalNormal = useExternalTexture(material.textures?.normalMap)
  const externalRough = useExternalTexture(material.textures?.roughnessMap)

  const map = useRepeatedTexture(
    texturesEnabled ? (externalMap ?? procedural?.map ?? null) : null,
    material,
    uv,
  )
  const normalMap = useRepeatedTexture(
    texturesEnabled ? (externalNormal ?? procedural?.normalMap ?? null) : null,
    material,
    uv,
  )
  const roughnessMap = useRepeatedTexture(
    texturesEnabled ? (externalRough ?? procedural?.roughnessMap ?? null) : null,
    material,
    uv,
  )
  const normalScale = useMemo(
    () => new THREE.Vector2(material.bump ?? 0, material.bump ?? 0),
    [material.bump],
  )
  const side =
    material.side === "back"
      ? THREE.BackSide
      : material.side === "double"
        ? THREE.DoubleSide
        : THREE.FrontSide
  const transparent = material.transparent || (material.opacity ?? 1) < 1

  if (material.sheen !== undefined || material.clearcoat !== undefined || material.transparent) {
    return (
      <meshPhysicalMaterial
        color={material.color}
        roughness={material.roughness}
        metalness={material.metalness}
        map={map ?? undefined}
        normalMap={normalMap ?? undefined}
        normalScale={normalScale}
        roughnessMap={roughnessMap ?? undefined}
        clearcoat={material.clearcoat ?? 0}
        clearcoatRoughness={material.clearcoatRoughness ?? 0.3}
        sheen={material.sheen ?? 0}
        sheenColor={material.color}
        sheenRoughness={0.7}
        transparent={transparent}
        opacity={material.opacity ?? 1}
        depthWrite={!transparent}
        side={side}
        emissive={material.emissive ?? "#000000"}
        emissiveIntensity={material.emissiveIntensity ?? 0}
        envMapIntensity={envMapIntensity}
      />
    )
  }

  return (
    <meshStandardMaterial
      color={material.color}
      roughness={material.roughness}
      metalness={material.metalness}
      map={map ?? undefined}
      normalMap={normalMap ?? undefined}
      normalScale={normalScale}
      roughnessMap={roughnessMap ?? undefined}
      side={side}
      envMapIntensity={envMapIntensity}
    />
  )
}
