import type { ReactNode } from "react"
import { useMediaUrl } from "@/lib/media"

export function AuthenticatedImage({
  cacheKey,
  loader,
  alt,
  className,
  fallback = null,
}: {
  cacheKey: string
  loader: () => Promise<Blob>
  alt: string
  className?: string
  fallback?: ReactNode
}) {
  const { url, loading } = useMediaUrl(cacheKey, loader)
  if (loading) {
    return <div className="app-media-placeholder" aria-label="Chargement de l'image" />
  }
  if (!url) return <>{fallback}</>
  return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />
}
