import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createNote: vi.fn(),
  uploadPhoto: vi.fn(),
  createReserve: vi.fn(),
}))

vi.mock("../src/lib/api-client", () => {
  class ApiClientError extends Error {
    status: number
    code: string
    constructor(status: number, body: { error?: string; code?: string }, fallback: string) {
      super(body.error ?? fallback)
      this.status = status
      this.code = body.code ?? "error"
    }
  }
  return {
    ApiClientError,
    api: {
      notes: { create: mocks.createNote },
      photos: { upload: mocks.uploadPhoto },
      reserves: { create: mocks.createReserve },
    },
  }
})

import { ApiClientError } from "../src/lib/api-client"
import { idbClear } from "../src/lib/idb"
import {
  enqueueNote,
  enqueueReserve,
  flushOutbox,
  listOutbox,
} from "../src/lib/outbox"

const note = {
  clientId: "11111111-1111-4111-8111-111111111111",
  body: "Vérifier l'aplomb du mur nord.",
  takenAt: "2026-11-13T10:00:00+01:00",
  roomId: null,
}

beforeEach(async () => {
  await idbClear("outbox")
  mocks.createNote.mockReset()
  mocks.createReserve.mockReset()
  mocks.uploadPhoto.mockReset()
})

describe("file d'attente hors-ligne", () => {
  it("conserve une note puis la synchronise", async () => {
    await enqueueNote(note)
    expect(await listOutbox()).toHaveLength(1)

    mocks.createNote.mockResolvedValue({ id: "note-1" })
    const result = await flushOutbox()
    expect(result.sent).toBe(1)
    expect(mocks.createNote).toHaveBeenCalledOnce()
    expect(await listOutbox()).toHaveLength(0)
  })

  it("est idempotente sur le clientId", async () => {
    await enqueueNote(note)
    await enqueueNote(note)
    expect(await listOutbox()).toHaveLength(1)
  })

  it("marque une réserve refusée en erreur sans la supprimer", async () => {
    await enqueueReserve({
      clientId: "22222222-2222-4222-8222-222222222222",
      title: "Rayure",
      severity: "mineure",
      status: "open",
    })
    mocks.createReserve.mockRejectedValue(
      new ApiClientError(422, { error: "Données invalides", code: "validation_error" }, "refus"),
    )
    const result = await flushOutbox()
    expect(result.failed).toBe(1)
    const items = await listOutbox()
    expect(items).toHaveLength(1)
    expect(items[0]?.status).toBe("error")
  })
})
