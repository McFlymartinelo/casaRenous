import type { ZodType, z } from "zod"
import {
  AuthSessionResponse,
  BudgetItemSchema,
  BudgetResponse,
  CalendarFeedResponse,
  CalendarTokenMetadata,
  DocumentAnalysisSchema,
  DocumentPageSchema,
  DocumentSchema,
  DocumentUpdateInput,
  InvitationCreateInput,
  InvitationCreatedResponse,
  InvitationListSchema,
  KeyDateCreateInput,
  KeyDateSchema,
  KeyDateUpdateInput,
  LoginInput,
  LoginResponse,
  MilestoneCreateInput,
  MilestoneSchema,
  MilestoneUpdateInput,
  NoteCreateInput,
  NoteSchema,
  NoteUpdateInput,
  OkResponse,
  OtpResendResponse,
  OtpVerifyInput,
  PasswordChangeInput,
  PhotoPageSchema,
  PhotoSchema,
  PhotoUpdateInput,
  ProjectProfileSchema,
  PushStatusResponse,
  PushSubscribeInput,
  PushTestResponse,
  PushVapidResponse,
  RegisterRequestInput,
  RegisterVerifyInput,
  ReserveCreateInput,
  ReservePageSchema,
  ReserveSchema,
  ReserveUpdateInput,
  RoomListSchema,
  RoomSchema,
  RoomUpdateInput,
  SessionListSchema,
  KeyDateListSchema,
  MilestoneListSchema,
  NoteListSchema,
  type ApiErrorBody,
  type BudgetCreateInput as BudgetCreate,
  type BudgetResponse as BudgetResponseType,
  type BudgetUpdateInput,
  type Document,
  type DocumentAnalysis,
  type DocumentQuery,
  type DocumentUpdateInput as DocumentUpdate,
  type DocumentUploadFields as DocumentUpload,
  type Invitation,
  type InvitationCreateInput as InvitationCreate,
  type KeyDate,
  type KeyDateCreateInput as KeyDateCreate,
  type KeyDateUpdateInput as KeyDateUpdate,
  type LoginInput as LoginInputType,
  type Milestone,
  type MilestoneCreateInput as MilestoneCreate,
  type MilestoneQuery,
  type MilestoneUpdateInput as MilestoneUpdate,
  type Note,
  type NoteCreateInput as NoteCreate,
  type NoteUpdateInput as NoteUpdate,
  type Paginated,
  type Photo,
  type PhotoQuery,
  type PhotoUpdateInput as PhotoUpdate,
  type PhotoUploadFields as PhotoUpload,
  type ProjectProfile,
  type Reserve,
  type ReserveCreateInput as ReserveCreate,
  type ReserveQuery,
  type RegisterRequestInput as RegisterRequest,
  type ReserveUpdateInput as ReserveUpdate,
  type Room,
  type RoomUpdateInput as RoomUpdate,
  type SessionSummary as SessionSummaryType,
  type UserPublic,
} from "@casarenous/shared"

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, string[]>
  readonly requestId?: string

  constructor(status: number, body: Partial<ApiErrorBody>, fallback: string) {
    super(body.error ?? fallback)
    this.name = "ApiClientError"
    this.status = status
    this.code = body.code ?? "client_error"
    this.details = body.details
    this.requestId = body.requestId
  }
}

export const UNAUTHORIZED_EVENT = "casarenous:unauthorized"

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" })
}

function notifyUnauthorized(path: string): void {
  if (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/otp")) return
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
}

async function parseError(response: Response): Promise<ApiClientError> {
  let body: Partial<ApiErrorBody> = {}
  try {
    body = (await response.json()) as Partial<ApiErrorBody>
  } catch {
    body = {}
  }
  const fallback =
    response.status === 404
      ? "API introuvable (404) — vérifie que le backend est démarré et que /api est bien proxifié par nginx."
      : `Erreur ${response.status}`
  return new ApiClientError(response.status, body, fallback)
}

async function request<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("Accept", "application/json")
  if (init.body != null && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const response = await apiFetch(path, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    throw await parseError(response)
  }
  if (response.status === 204) {
    return schema.parse(undefined)
  }
  const json = (await response.json()) as unknown
  return schema.parse(json)
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await apiFetch(path)
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    throw await parseError(response)
  }
  return response.blob()
}

async function requestText(path: string): Promise<string> {
  const response = await apiFetch(path)
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized(path)
    throw await parseError(response)
  }
  return response.text()
}

/* ── Upload XHR (progression) ─────────────────────────────────────────── */

function xhrUpload<T>(
  path: string,
  schema: ZodType<T>,
  form: FormData,
  onProgress?: (ratio: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", path, true)
    xhr.withCredentials = true
    xhr.responseType = "text"
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total)
      }
    }
    xhr.onerror = () =>
      reject(new ApiClientError(0, { code: "network_error" }, "Réseau indisponible"))
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiClientError(
            xhr.status,
            (body ?? {}) as Partial<ApiErrorBody>,
            `Erreur ${xhr.status}`,
          ),
        )
        return
      }
      try {
        resolve(schema.parse(body))
      } catch (error) {
        reject(error)
      }
    }
    xhr.send(form)
  })
}

function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

/* ── Schémas de réponse ───────────────────────────────────────────────── */



/* ── API ──────────────────────────────────────────────────────────────── */

export const api = {
  auth: {
    login: (input: LoginInputType): Promise<z.infer<typeof LoginResponse>> =>
      request("/api/auth/login", LoginResponse, {
        method: "POST",
        body: JSON.stringify(LoginInput.parse(input)),
      }),
    verifyOtp: (code: string): Promise<z.infer<typeof AuthSessionResponse>> =>
      request("/api/auth/otp", AuthSessionResponse, {
        method: "POST",
        body: JSON.stringify(OtpVerifyInput.parse({ code })),
      }),
    resendOtp: (): Promise<z.infer<typeof OtpResendResponse>> =>
      request("/api/auth/otp/resend", OtpResendResponse, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    registerRequest: (input: RegisterRequest): Promise<z.infer<typeof LoginResponse>> =>
      request("/api/auth/register", LoginResponse, {
        method: "POST",
        body: JSON.stringify(RegisterRequestInput.parse(input)),
      }),
    verifyRegistration: (code: string): Promise<z.infer<typeof AuthSessionResponse>> =>
      request("/api/auth/register/otp", AuthSessionResponse, {
        method: "POST",
        body: JSON.stringify(RegisterVerifyInput.parse({ code })),
      }),
    resendRegistration: (): Promise<z.infer<typeof OtpResendResponse>> =>
      request("/api/auth/register/resend", OtpResendResponse, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    me: (): Promise<{ user: UserPublic }> =>
      request("/api/auth/me", AuthSessionResponse),
    logout: (): Promise<z.infer<typeof OkResponse>> =>
      request("/api/auth/logout", OkResponse, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    changePassword: (input: z.infer<typeof PasswordChangeInput>) =>
      request("/api/auth/password", OkResponse, {
        method: "POST",
        body: JSON.stringify(PasswordChangeInput.parse(input)),
      }),
    sessions: (): Promise<SessionSummaryType[]> =>
      request("/api/auth/sessions", SessionListSchema),
    revokeSession: (id: string) =>
      request(`/api/auth/sessions/${id}`, OkResponse, { method: "DELETE" }),
  },
  project: (): Promise<ProjectProfile> => request("/api/project", ProjectProfileSchema),
  rooms: {
    list: (): Promise<Room[]> => request("/api/rooms", RoomListSchema),
    get: (slug: string): Promise<Room> => request(`/api/rooms/${slug}`, RoomSchema),
    update: (id: string, input: RoomUpdate): Promise<Room> =>
      request(`/api/rooms/${id}`, RoomSchema, {
        method: "PATCH",
        body: JSON.stringify(RoomUpdateInput.parse(input)),
      }),
  },
  keyDates: {
    list: (): Promise<KeyDate[]> => request("/api/key-dates", KeyDateListSchema),
    create: (input: KeyDateCreate): Promise<KeyDate> =>
      request("/api/key-dates", KeyDateSchema, {
        method: "POST",
        body: JSON.stringify(KeyDateCreateInput.parse(input)),
      }),
    update: (id: string, input: KeyDateUpdate): Promise<KeyDate> =>
      request(`/api/key-dates/${id}`, KeyDateSchema, {
        method: "PATCH",
        body: JSON.stringify(KeyDateUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/key-dates/${id}`, OkResponse, { method: "DELETE" }),
  },
  milestones: {
    list: (query: Partial<MilestoneQuery> = {}): Promise<Milestone[]> =>
      request(
        `/api/milestones${queryString({
          from: query.from,
          to: query.to,
          category: query.category,
          status: query.status,
        })}`,
        MilestoneListSchema,
      ),
    create: (input: MilestoneCreate): Promise<Milestone> =>
      request("/api/milestones", MilestoneSchema, {
        method: "POST",
        body: JSON.stringify(MilestoneCreateInput.parse(input)),
      }),
    update: (id: string, input: MilestoneUpdate): Promise<Milestone> =>
      request(`/api/milestones/${id}`, MilestoneSchema, {
        method: "PATCH",
        body: JSON.stringify(MilestoneUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/milestones/${id}`, OkResponse, { method: "DELETE" }),
    calendar: (): Promise<string> => requestText("/api/milestones/calendar.ics"),
    calendarToken: (): Promise<z.infer<typeof CalendarTokenMetadata>> =>
      request("/api/calendar/token", CalendarTokenMetadata),
    rotateCalendarToken: (): Promise<z.infer<typeof CalendarFeedResponse>> =>
      request("/api/calendar/token", CalendarFeedResponse, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    revokeCalendarToken: () =>
      request("/api/calendar/token", OkResponse, { method: "DELETE" }),
  },
  documents: {
    list: (query: Partial<DocumentQuery> = {}): Promise<Paginated<Document>> =>
      request(
        `/api/documents${queryString({
          category: query.category,
          roomId: query.roomId,
          q: query.q,
          cursor: query.cursor,
          limit: query.limit,
        })}`,
        DocumentPageSchema,
      ),
    upload: (
      fields: DocumentUpload,
      file: File,
      onProgress?: (ratio: number) => void,
    ): Promise<Document> => {
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) form.set(key, String(value))
      }
      form.set("file", file)
      return xhrUpload("/api/documents", DocumentSchema, form, onProgress)
    },
    update: (id: string, input: DocumentUpdate): Promise<Document> =>
      request(`/api/documents/${id}`, DocumentSchema, {
        method: "PATCH",
        body: JSON.stringify(DocumentUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/documents/${id}`, OkResponse, { method: "DELETE" }),
    file: (id: string): Promise<Blob> => requestBlob(`/api/documents/${id}/file`),
    analysis: (id: string): Promise<DocumentAnalysis> =>
      request(`/api/documents/${id}/analysis`, DocumentAnalysisSchema),
    analyze: (id: string): Promise<DocumentAnalysis> =>
      request(`/api/documents/${id}/analyze`, DocumentAnalysisSchema, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },
  photos: {
    list: (query: Partial<PhotoQuery> = {}): Promise<Paginated<Photo>> =>
      request(
        `/api/photos${queryString({
          from: query.from,
          to: query.to,
          roomId: query.roomId,
          cursor: query.cursor,
          limit: query.limit,
        })}`,
        PhotoPageSchema,
      ),
    upload: (
      fields: PhotoUpload,
      file: Blob,
      onProgress?: (ratio: number) => void,
    ): Promise<Photo> => {
      const form = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) form.set(key, String(value))
      }
      form.set("file", file, `${fields.clientId}.jpg`)
      return xhrUpload("/api/photos", PhotoSchema, form, onProgress)
    },
    update: (id: string, input: PhotoUpdate): Promise<Photo> =>
      request(`/api/photos/${id}`, PhotoSchema, {
        method: "PATCH",
        body: JSON.stringify(PhotoUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/photos/${id}`, OkResponse, { method: "DELETE" }),
    file: (id: string): Promise<Blob> => requestBlob(`/api/photos/${id}/file`),
    thumb: (id: string): Promise<Blob> => requestBlob(`/api/photos/${id}/thumb`),
  },
  notes: {
    list: (): Promise<Note[]> => request("/api/notes", NoteListSchema),
    create: (input: NoteCreate): Promise<Note> =>
      request("/api/notes", NoteSchema, {
        method: "POST",
        body: JSON.stringify(NoteCreateInput.parse(input)),
      }),
    update: (id: string, input: NoteUpdate): Promise<Note> =>
      request(`/api/notes/${id}`, NoteSchema, {
        method: "PATCH",
        body: JSON.stringify(NoteUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/notes/${id}`, OkResponse, { method: "DELETE" }),
  },
  reserves: {
    list: (query: Partial<ReserveQuery> = {}): Promise<Paginated<Reserve>> =>
      request(
        `/api/reserves${queryString({
          status: query.status,
          severity: query.severity,
          roomId: query.roomId,
          cursor: query.cursor,
          limit: query.limit,
        })}`,
        ReservePageSchema,
      ),
    create: (input: ReserveCreate): Promise<Reserve> =>
      request("/api/reserves", ReserveSchema, {
        method: "POST",
        body: JSON.stringify(ReserveCreateInput.parse(input)),
      }),
    update: (id: string, input: ReserveUpdate): Promise<Reserve> =>
      request(`/api/reserves/${id}`, ReserveSchema, {
        method: "PATCH",
        body: JSON.stringify(ReserveUpdateInput.parse(input)),
      }),
    remove: (id: string) =>
      request(`/api/reserves/${id}`, OkResponse, { method: "DELETE" }),
    exportCsv: (): Promise<Blob> => requestBlob("/api/reserves/export.csv"),
  },
  budget: {
    get: (): Promise<BudgetResponseType> => request("/api/budget", BudgetResponse),
    create: (input: BudgetCreate): Promise<z.infer<typeof BudgetItemSchema>> =>
      request("/api/budget/items", BudgetItemSchema, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: BudgetUpdateInput): Promise<z.infer<typeof BudgetItemSchema>> =>
      request(`/api/budget/items/${id}`, BudgetItemSchema, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request(`/api/budget/items/${id}`, OkResponse, { method: "DELETE" }),
    exportCsv: (): Promise<Blob> => requestBlob("/api/budget/export.csv"),
  },
  admin: {
    invitations: {
      list: (): Promise<Invitation[]> =>
        request("/api/admin/invitations", InvitationListSchema),
      create: (input: InvitationCreate): Promise<z.infer<typeof InvitationCreatedResponse>> =>
        request("/api/admin/invitations", InvitationCreatedResponse, {
          method: "POST",
          body: JSON.stringify(InvitationCreateInput.parse(input)),
        }),
      revoke: (id: string) =>
        request(`/api/admin/invitations/${id}`, OkResponse, { method: "DELETE" }),
    },
  },
  push: {
    vapid: (): Promise<z.infer<typeof PushVapidResponse>> =>
      request("/api/push/vapid", PushVapidResponse),
    subscribe: (input: z.infer<typeof PushSubscribeInput>) =>
      request("/api/push/subscribe", OkResponse, {
        method: "POST",
        body: JSON.stringify(PushSubscribeInput.parse(input)),
      }),
    unsubscribe: (endpoint: string) =>
      request("/api/push/unsubscribe", OkResponse, {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      }),
    test: (): Promise<z.infer<typeof PushTestResponse>> =>
      request("/api/push/test", PushTestResponse, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    status: (): Promise<z.infer<typeof PushStatusResponse>> =>
      request("/api/push/status", PushStatusResponse),
  },
}

export type { Paginated }
