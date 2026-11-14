import { daysBetween, toIsoDate } from "@casarenous/shared"

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = new Date(`${value}T12:00:00+01:00`)
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date)
}

export function formatDateShort(value: string): string {
  return formatDate(value, { year: undefined })
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function countdown(value: string): { days: number; label: string; past: boolean } {
  const days = daysBetween(todayIso(), value)
  if (days === 0) return { days, label: "Aujourd'hui", past: false }
  if (days > 0) return { days, label: `J-${days}`, past: false }
  return { days, label: `J+${Math.abs(days)}`, past: true }
}

export function quarterKey(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  return `${date.getUTCFullYear()} · T${Math.floor(date.getUTCMonth() / 3) + 1}`
}

export function monthKey(value: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+01:00`))
}

export function weekdayLabel(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00+01:00`))
}

export function monthInputValue(value: string): string {
  return value.slice(0, 7)
}

export function isWithinNextDays(value: string, days: number): boolean {
  const diff = daysBetween(todayIso(), value)
  return diff >= 0 && diff <= days
}

export { toIsoDate }
