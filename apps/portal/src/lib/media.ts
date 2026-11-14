import { useEffect, useRef, useState } from "react"

export function useMediaUrl(
  cacheKey: string,
  loader: () => Promise<Blob>,
): { url: string | null; loading: boolean; error: boolean } {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(false)
    loaderRef
      .current()
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cacheKey])

  return { url, loading, error }
}

/**
 * Convertit une photo de téléphone en JPEG borné à 2048 px.
 * Supprime les métadonnées EXIF (dont le GPS) avant l'envoi.
 */
export async function compressImage(file: Blob, maxSize = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas indisponible")
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Compression impossible"))
      },
      "image/jpeg",
      0.86,
    )
  })
}

export interface Position {
  lat: number
  lng: number
  accuracyM: number
}

export function getPosition(timeoutMs = 8000): Promise<Position | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer)
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Math.round(position.coords.accuracy),
        })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}
