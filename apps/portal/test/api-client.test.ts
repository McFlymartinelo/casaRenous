import { afterEach, describe, expect, it, vi } from "vitest"
import { api } from "../src/lib/api-client"

const project = {
  id: 1,
  name: "Maison Sévin – Renous",
  footprintWidthM: 7.1,
  footprintDepthM: 13.6,
  levels: 2,
  kitchenSpecs: {
    facades: "Beige / crème",
    worktop: "Marbre blanc veiné doré",
    credence: "Marbre blanc veiné doré",
    island: { return: "Bois clair", seats: 3 },
    wineCellar: true,
    appliances: ["Four noir"],
    lighting: "3 suspensions noires",
  },
  exteriorSpecs: {
    finish: "Enduit clair",
    roof: "Tuiles deux pans",
    joinery: "Blanches",
    shutters: "VR MOT",
    terrace: "Terrasse bois",
  },
  updatedAt: "2026-11-13T10:00:00.000Z",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("client API et schémas Zod partagés", () => {
  it("valide une réponse projet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(project), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    )
    const result = await api.project()
    expect(result.footprintWidthM).toBe(7.1)
    expect(result.kitchenSpecs.island.seats).toBe(3)
  })

  it("valide un budget en centimes et rejette un flottant", async () => {
    const payload = {
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          kind: "ccmi_call",
          label: "Appel 1",
          reference: null,
          amountCents: 150000,
          dueDate: null,
          paidAt: null,
          status: "planned",
          attachmentDocumentId: null,
          notes: null,
          createdAt: "2026-11-13T10:00:00.000Z",
          updatedAt: "2026-11-13T10:00:00.000Z",
        },
      ],
      summary: {
        totalCents: 150000,
        ccmiCents: 150000,
        changeOrdersCents: 0,
        invoiceCents: 0,
        paidCents: 0,
        remainingCents: 150000,
        count: 1,
      },
    }

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await api.budget.get()
    expect(result.summary.totalCents).toBe(150000)

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ...payload,
            items: [{ ...payload.items[0], amountCents: 1500.5 }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    )
    await expect(api.budget.get()).rejects.toThrow()
  })

  it("refuse une réponse hors contrat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ nope: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    )
    await expect(api.project()).rejects.toThrow()
  })
})
