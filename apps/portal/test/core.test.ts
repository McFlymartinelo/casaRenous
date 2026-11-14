import { describe, expect, it } from "vitest"
import { formatCents, parseEuroToCents, PROJECT_END_DATE } from "@casarenous/shared"
import { countdown, formatDate, quarterKey, todayIso } from "../src/lib/dates"
import { oklchToHex } from "../src/lib/oklch"

describe("formatage projet", () => {
  it("formate les dates en français", () => {
    expect(formatDate("2026-11-06")).toContain("6 nov.")
  })

  it("calcule les trimestres du rétroplanning", () => {
    expect(quarterKey("2028-12-15")).toBe("2028 · T4")
    expect(quarterKey("2027-01-01")).toBe("2027 · T1")
  })

  it("produit un compte à rebours lisible", () => {
    const value = countdown(PROJECT_END_DATE)
    expect(value.days).toBeGreaterThan(0)
    expect(value.label).toMatch(/^J-\d+$/)
  })

  it("retourne la date du jour en Europe/Paris", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("couleurs tokenisées", () => {
  it("convertit OKLCH en sRGB pour WebGL", () => {
    expect(oklchToHex("oklch(0% 0 0)")).toBe("#000000")
    expect(oklchToHex("oklch(100% 0 0)")).toBe("#ffffff")
    expect(oklchToHex("oklch(55% 0.132 45)")).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("refuse une valeur non OKLCH", () => {
    expect(oklchToHex("color-mix(in oklab, red, blue)")).toBeNull()
  })
})

describe("budget", () => {
  it("reste exact en centimes", () => {
    expect(parseEuroToCents("42,68")).toBe(4268)
    expect(parseEuroToCents("-1 234,56")).toBe(-123456)
    expect(formatCents(4268)).toContain("42,68")
  })
})
