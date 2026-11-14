const DB_NAME = "casarenous"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible"))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("outbox")) {
        const store = db.createObjectStore("outbox", { keyPath: "id" })
        store.createIndex("createdAt", "createdAt")
      }
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB error"))
  })
  return dbPromise
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = run(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"))
      }),
  )
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  const result = await tx<T | undefined>(store, "readonly", (s) => s.get(key))
  return result ?? null
}

export async function idbSet<T>(store: string, value: T): Promise<void> {
  await tx(store, "readwrite", (s) => s.put(value))
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(key))
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, "readonly", (s) => s.getAll())
}

export async function idbClear(store: string): Promise<void> {
  await tx(store, "readwrite", (s) => s.clear())
}
