import { QueryClient } from "@tanstack/react-query"
import type {
  PersistQueryClientOptions,
  Persister,
} from "@tanstack/react-query-persist-client"
import { ApiClientError } from "./api-client"
import { idbClear, idbDelete, idbGet, idbSet } from "./idb"

const PERSIST_KEY = "query-cache-v1"
const MAX_AGE = 7 * 24 * 60 * 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: MAX_AGE,
      networkMode: "offlineFirst",
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: {
      networkMode: "online",
      retry: 0,
    },
  },
})

interface StoredCache {
  key: string
  value: unknown
}

export const persister: Persister = {
  persistClient: async (client) => {
    await idbSet<StoredCache>("cache", { key: PERSIST_KEY, value: client })
  },
  restoreClient: async () => {
    const stored = await idbGet<StoredCache>("cache", PERSIST_KEY)
    return stored?.value as Awaited<ReturnType<Persister["restoreClient"]>>
  },
  removeClient: async () => {
    await idbDelete("cache", PERSIST_KEY)
  },
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: MAX_AGE,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" && query.queryKey[0] !== "media",
  },
}

export async function clearPersistedCache(): Promise<void> {
  queryClient.clear()
  await persister.removeClient()
  await idbClear("cache")
}
