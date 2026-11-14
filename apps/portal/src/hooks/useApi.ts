import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  BudgetCreateInput,
  BudgetUpdateInput,
  DocumentCategoryCreateInput,
  DocumentQuery,
  DocumentUpdateInput,
  DocumentUploadFields,
  InvitationCreateInput,
  KeyDateCreateInput,
  KeyDateUpdateInput,
  MilestoneCreateInput,
  MilestoneQuery,
  MilestoneUpdateInput,
  NoteCreateInput,
  PhotoQuery,
  PhotoUploadFields,
  ReserveCreateInput,
  ReserveQuery,
  ReserveUpdateInput,
  RoomUpdateInput,
} from "@casarenous/shared"
import { api } from "@/lib/api-client"
import { queryClient } from "@/lib/query-client"

const keys = {
  project: ["project"] as const,
  rooms: ["rooms"] as const,
  keyDates: ["key-dates"] as const,
  milestones: (query: Partial<MilestoneQuery>) => ["milestones", query] as const,
  documents: (query: Partial<DocumentQuery>) => ["documents", query] as const,
  documentAnalysis: (id: string) => ["documents", "analysis", id] as const,
  documentCategories: ["document-categories"] as const,
  photos: (query: Partial<PhotoQuery>) => ["photos", query] as const,
  notes: ["notes"] as const,
  reserves: (query: Partial<ReserveQuery>) => ["reserves", query] as const,
  budget: ["budget"] as const,
  sessions: ["sessions"] as const,
  calendarToken: ["calendar-token"] as const,
  invitations: ["invitations"] as const,
}

export function useProject() {
  return useQuery({ queryKey: keys.project, queryFn: api.project })
}

export function useRooms() {
  return useQuery({ queryKey: keys.rooms, queryFn: api.rooms.list })
}

export function useKeyDates() {
  return useQuery({ queryKey: keys.keyDates, queryFn: api.keyDates.list })
}

export function useMilestones(query: Partial<MilestoneQuery> = {}) {
  return useQuery({
    queryKey: keys.milestones(query),
    queryFn: () => api.milestones.list(query),
  })
}

export function useDocuments(query: Partial<DocumentQuery> = {}) {
  return useQuery({
    queryKey: keys.documents(query),
    queryFn: () => api.documents.list(query),
  })
}

export function usePhotos(query: Partial<PhotoQuery> = {}) {
  return useQuery({
    queryKey: keys.photos(query),
    queryFn: () => api.photos.list(query),
  })
}

export function useNotes() {
  return useQuery({ queryKey: keys.notes, queryFn: api.notes.list })
}

export function useReserves(query: Partial<ReserveQuery> = {}) {
  return useQuery({
    queryKey: keys.reserves(query),
    queryFn: () => api.reserves.list(query),
  })
}

export function useBudget() {
  return useQuery({ queryKey: keys.budget, queryFn: api.budget.get })
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: api.auth.sessions })
}

export function useCalendarToken() {
  return useQuery({ queryKey: keys.calendarToken, queryFn: api.milestones.calendarToken })
}

export function useInvitations(enabled = true) {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: api.admin.invitations.list,
    enabled,
  })
}

/* ── Mutations ────────────────────────────────────────────────────────── */

function useInvalidate(...queryKeys: readonly (readonly unknown[])[]) {
  const client = useQueryClient()
  return async () => {
    await Promise.all(
      queryKeys.map((queryKey) => client.invalidateQueries({ queryKey })),
    )
  }
}

export function useCreateKeyDate() {
  const invalidate = useInvalidate(keys.keyDates)
  return useMutation({
    mutationFn: (input: KeyDateCreateInput) => api.keyDates.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateKeyDate() {
  const invalidate = useInvalidate(keys.keyDates)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: KeyDateUpdateInput }) =>
      api.keyDates.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteKeyDate() {
  const invalidate = useInvalidate(keys.keyDates)
  return useMutation({
    mutationFn: (id: string) => api.keyDates.remove(id),
    onSuccess: invalidate,
  })
}

export function useCreateMilestone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MilestoneCreateInput) => api.milestones.create(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["milestones"] })
    },
  })
}

export function useUpdateMilestone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MilestoneUpdateInput }) =>
      api.milestones.update(id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["milestones"] })
    },
  })
}

export function useDeleteMilestone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.milestones.remove(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["milestones"] })
    },
  })
}

export function useUpdateRoom() {
  const invalidate = useInvalidate(keys.rooms)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RoomUpdateInput }) =>
      api.rooms.update(id, input),
    onSuccess: invalidate,
  })
}

export function useUploadDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      fields,
      file,
      onProgress,
    }: {
      fields: DocumentUploadFields
      file: File
      onProgress?: (ratio: number) => void
    }) => api.documents.upload(fields, file, onProgress),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}

export function useUpdateDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DocumentUpdateInput }) =>
      api.documents.update(id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}

export function useDeleteDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.documents.remove(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}

export function useAnalyzeDocument() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.documents.analyze(id),
    onSuccess: (analysis) => {
      client.setQueryData(keys.documentAnalysis(analysis.documentId), analysis)
    },
  })
}

export function useDocumentCategories() {
  return useQuery({
    queryKey: keys.documentCategories,
    queryFn: api.documentCategories.list,
  })
}

export function useCreateDocumentCategory() {
  const invalidate = useInvalidate(keys.documentCategories, ["documents"])
  return useMutation({
    mutationFn: (input: DocumentCategoryCreateInput) =>
      api.documentCategories.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateDocumentCategory() {
  const invalidate = useInvalidate(keys.documentCategories, ["documents"])
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DocumentCategoryCreateInput }) =>
      api.documentCategories.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteDocumentCategory() {
  const invalidate = useInvalidate(keys.documentCategories, ["documents"])
  return useMutation({
    mutationFn: (id: string) => api.documentCategories.remove(id),
    onSuccess: invalidate,
  })
}

export function useUploadPhoto() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      fields,
      file,
      onProgress,
    }: {
      fields: PhotoUploadFields
      file: Blob
      onProgress?: (ratio: number) => void
    }) => api.photos.upload(fields, file, onProgress),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["photos"] })
    },
  })
}

export function useDeletePhoto() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.photos.remove(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["photos"] })
    },
  })
}

export function useCreateNote() {
  const invalidate = useInvalidate(keys.notes)
  return useMutation({
    mutationFn: (input: NoteCreateInput) => api.notes.create(input),
    onSuccess: invalidate,
  })
}

export function useCreateReserve() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ReserveCreateInput) => api.reserves.create(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reserves"] })
    },
  })
}

export function useUpdateReserve() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReserveUpdateInput }) =>
      api.reserves.update(id, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reserves"] })
    },
  })
}

export function useDeleteReserve() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.reserves.remove(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["reserves"] })
    },
  })
}

export function useCreateBudgetItem() {
  const invalidate = useInvalidate(keys.budget)
  return useMutation({
    mutationFn: (input: BudgetCreateInput) => api.budget.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateBudgetItem() {
  const invalidate = useInvalidate(keys.budget)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BudgetUpdateInput }) =>
      api.budget.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteBudgetItem() {
  const invalidate = useInvalidate(keys.budget)
  return useMutation({
    mutationFn: (id: string) => api.budget.remove(id),
    onSuccess: invalidate,
  })
}

export function useRotateCalendarToken() {
  const invalidate = useInvalidate(keys.calendarToken)
  return useMutation({
    mutationFn: () => api.milestones.rotateCalendarToken(),
    onSuccess: invalidate,
  })
}

export function useRevokeCalendarToken() {
  const invalidate = useInvalidate(keys.calendarToken)
  return useMutation({
    mutationFn: () => api.milestones.revokeCalendarToken(),
    onSuccess: invalidate,
  })
}

export function useCreateInvitation() {
  const invalidate = useInvalidate(keys.invitations)
  return useMutation({
    mutationFn: (input: InvitationCreateInput) => api.admin.invitations.create(input),
    onSuccess: invalidate,
  })
}

export function useRevokeInvitation() {
  const invalidate = useInvalidate(keys.invitations)
  return useMutation({
    mutationFn: (id: string) => api.admin.invitations.revoke(id),
    onSuccess: invalidate,
  })
}

export function useRevokeSession() {
  const invalidate = useInvalidate(keys.sessions)
  return useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: invalidate,
  })
}

export function useRefreshAll() {
  const client = useQueryClient()
  return async () => {
    await client.invalidateQueries()
  }
}

export { queryClient }
