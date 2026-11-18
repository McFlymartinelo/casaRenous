export function formatMeters(value: number, digits = 2): string {
  return `${value.toFixed(digits).replace(".", ",")} m`
}

export function formatDimensions(w: number, d: number, h?: number): string {
  const base = `${Math.round(w * 100)} × ${Math.round(d * 100)}`
  return h === undefined ? `${base} cm` : `${base} × H ${Math.round(h * 100)} cm`
}

export function formatArea(m2: number): string {
  return `${m2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} m²`
}

export function formatPrice(value: number): string {
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}
