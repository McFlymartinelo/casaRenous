import { useTheme } from "@/aura/react"

type BrandVariant = "horizontal" | "stacked" | "symbol"

const RATIO: Record<BrandVariant, number> = {
  horizontal: 512 / 1885,
  stacked: 695 / 896,
  symbol: 1,
}

export function BrandLogo({
  variant = "horizontal",
  width = 160,
  className,
  priority = false,
}: {
  variant?: BrandVariant
  width?: number
  className?: string
  priority?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  const source =
    variant === "symbol"
      ? "/brand/casarenous-symbol.svg"
      : variant === "stacked"
        ? dark
          ? "/brand/casarenous-logo-stacked-fond-sombre.svg"
          : "/brand/casarenous-logo-stacked.svg"
        : dark
          ? "/brand/casarenous-logo-horizontal-fond-sombre.svg"
          : "/brand/casarenous-logo-horizontal.svg"

  const height = Math.round(width * RATIO[variant])

  return (
    <img
      src={source}
      width={width}
      height={height}
      alt="CasaRenous"
      className={className}
      draggable={false}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
    />
  )
}
