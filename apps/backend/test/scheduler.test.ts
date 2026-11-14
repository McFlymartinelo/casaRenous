import { describe, expect, it } from "vitest"
import { chooseNotifyDay } from "../src/services/scheduler.js"

describe("rappels de jalons", () => {
  it("choisit le palier exact quand il existe", () => {
    expect(chooseNotifyDay([7, 1], 7)).toBe(7)
    expect(chooseNotifyDay([7, 1], 1)).toBe(1)
    expect(chooseNotifyDay([90, 30, 7, 1], 45)).toBe(90)
  })

  it("rattrape un palier manqué sans redémarrer trop tôt", () => {
    expect(chooseNotifyDay([7, 1], 3)).toBe(7)
    expect(chooseNotifyDay([7, 1], 0)).toBe(1)
  })

  it("ignore un événement trop lointain", () => {
    expect(chooseNotifyDay([7, 1], 10)).toBeNull()
    expect(chooseNotifyDay([90, 30, 7, 1], 120)).toBeNull()
  })
})
