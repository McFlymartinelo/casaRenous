import type { Milestone } from "@casarenous/shared"
import { PROJECT_HOST } from "@casarenous/shared"

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8")
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ""
  let currentBytes = 0
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8")
    if (currentBytes + charBytes > 73) {
      parts.push(current)
      current = ""
      currentBytes = 0
    }
    current += char
    currentBytes += charBytes
  }
  if (current) parts.push(current)
  return parts.join("\r\n ")
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function dateValue(value: string): string {
  return value.replace(/-/g, "")
}

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10).replace(/-/g, "")
}

function statusFor(milestone: Milestone): string {
  if (milestone.status === "cancelled") return "CANCELLED"
  if (milestone.status === "done") return "CONFIRMED"
  return "TENTATIVE"
}

export function buildCalendar(milestones: Milestone[], now = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CasaRenous//Retroplanning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CasaRenous — Rétroplanning",
    "X-WR-TIMEZONE:Europe/Paris",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "X-LIC-LOCATION:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ]

  for (const milestone of milestones) {
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${milestone.id}@${PROJECT_HOST}`)
    lines.push(`DTSTAMP:${stamp(now)}`)
    lines.push(`DTSTART;VALUE=DATE:${dateValue(milestone.plannedStart)}`)
    lines.push(`DTEND;VALUE=DATE:${nextDay(milestone.plannedEnd)}`)
    lines.push(`SUMMARY:${escapeText(milestone.title)}`)
    if (milestone.description) {
      lines.push(`DESCRIPTION:${escapeText(milestone.description)}`)
    }
    lines.push(`CATEGORIES:${milestone.category.toUpperCase()}`)
    lines.push(`STATUS:${statusFor(milestone)}`)
    lines.push(`LAST-MODIFIED:${stamp(new Date(milestone.updatedAt))}`)
    for (const days of [...new Set(milestone.notifyDays)].sort((a, b) => b - a)) {
      lines.push("BEGIN:VALARM")
      lines.push("ACTION:DISPLAY")
      lines.push(`DESCRIPTION:${escapeText(milestone.title)}`)
      lines.push(days === 0 ? "TRIGGER:PT0S" : `TRIGGER:-P${days}D`)
      lines.push("END:VALARM")
    }
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return `${lines.map(fold).join("\r\n")}\r\n`
}
