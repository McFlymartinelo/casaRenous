import { useCallback, useEffect, useState } from "react"
import type {
  NoteCreateInput,
  PhotoUploadFields,
  ReserveCreateInput,
} from "@casarenous/shared"
import { api, ApiClientError } from "./api-client"
import { idbDelete, idbGetAll, idbSet } from "./idb"
import { queryClient } from "./query-client"

export type OutboxStatus = "pending" | "syncing" | "error"

interface OutboxBase {
  id: string
  createdAt: string
  attempts: number
  status: OutboxStatus
  error?: string
}

export type OutboxItem =
  | (OutboxBase & {
      kind: "photo"
      payload: PhotoUploadFields
      blob: Blob
    })
  | (OutboxBase & {
      kind: "note"
      payload: NoteCreateInput
    })
  | (OutboxBase & {
      kind: "reserve"
      payload: ReserveCreateInput
    })

const STORE = "outbox"
const OUTBOX_EVENT = "casarenous:outbox"

function notify(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_EVENT))
  }
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const items = await idbGetAll<OutboxItem>(STORE)
  return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function enqueuePhoto(blob: Blob, payload: PhotoUploadFields): Promise<void> {
  await idbSet<OutboxItem>(STORE, {
    id: payload.clientId,
    kind: "photo",
    payload,
    blob,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  })
  notify()
}

export async function enqueueNote(payload: NoteCreateInput): Promise<void> {
  await idbSet<OutboxItem>(STORE, {
    id: payload.clientId,
    kind: "note",
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  })
  notify()
}

export async function enqueueReserve(payload: ReserveCreateInput): Promise<void> {
  await idbSet<OutboxItem>(STORE, {
    id: payload.clientId,
    kind: "reserve",
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  })
  notify()
}

export async function removeOutboxItem(id: string): Promise<void> {
  await idbDelete(STORE, id)
  notify()
}

export interface FlushResult {
  sent: number
  failed: number
  remaining: number
  unauthorized: boolean
}

let flushing = false

export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return { sent: 0, failed: 0, remaining: 0, unauthorized: false }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const items = await listOutbox()
    return { sent: 0, failed: 0, remaining: items.length, unauthorized: false }
  }

  flushing = true
  let sent = 0
  let failed = 0
  let unauthorized = false

  try {
    const items = await listOutbox()
    for (const item of items) {
      if (item.status === "error") continue
      const syncing = { ...item, status: "syncing" as const }
      await idbSet(STORE, syncing)
      notify()

      try {
        if (item.kind === "photo") {
          await api.photos.upload(item.payload, item.blob)
        } else if (item.kind === "note") {
          await api.notes.create(item.payload)
        } else {
          await api.reserves.create(item.payload)
        }
        await idbDelete(STORE, item.id)
        sent += 1
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          unauthorized = true
          await idbSet(STORE, { ...item, status: "pending" })
          break
        }
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
          failed += 1
          await idbSet(STORE, {
            ...item,
            status: "error",
            error: error.message,
          })
        } else {
          await idbSet(STORE, {
            ...item,
            status: "pending",
            attempts: item.attempts + 1,
            error: error instanceof Error ? error.message : "Réseau indisponible",
          })
        }
      }
      notify()
    }
  } finally {
    flushing = false
    notify()
  }

  if (sent > 0) {
    await queryClient.invalidateQueries({ queryKey: ["photos"] })
    await queryClient.invalidateQueries({ queryKey: ["notes"] })
    await queryClient.invalidateQueries({ queryKey: ["reserves"] })
  }

  const remaining = (await listOutbox()).filter((item) => item.status !== "error").length
  return { sent, failed, remaining, unauthorized }
}

export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setItems(await listOutbox())
  }, [])

  const flush = useCallback(async () => {
    setBusy(true)
    try {
      const result = await flushOutbox()
      await refresh()
      return result
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    const onOnline = () => void flush()
    window.addEventListener(OUTBOX_EVENT, onChange)
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onChange)
      window.removeEventListener("online", onOnline)
    }
  }, [flush, refresh])

  return {
    items,
    pending: items.filter((item) => item.status === "pending").length,
    errors: items.filter((item) => item.status === "error").length,
    busy,
    flush,
    refresh,
  }
}
