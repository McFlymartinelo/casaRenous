import { cn } from "./cn"

export interface SkeletonProps {
  className?: string
  lines?: number
  /** Dernière ligne plus courte, comme un paragraphe. */
  shortLast?: boolean
  height?: number | string
  width?: number | string
}

function sizeStyle(height?: number | string, width?: number | string) {
  return {
    ...(height !== undefined
      ? { height: typeof height === "number" ? `${height}px` : height }
      : {}),
    ...(width !== undefined
      ? { width: typeof width === "number" ? `${width}px` : width }
      : {}),
  }
}

export function Skeleton({
  className,
  lines,
  shortLast = true,
  height,
  width,
}: SkeletonProps) {
  const style = sizeStyle(height, width)

  if (!lines || lines < 2) {
    return <div className={cn("aura-skeleton", className)} style={style} aria-hidden />
  }

  return (
    <div className="aura-stack" aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cn(
            "aura-skeleton",
            shortLast && index === lines - 1 && "aura-skeleton--short",
            className,
          )}
          style={style}
        />
      ))}
    </div>
  )
}
