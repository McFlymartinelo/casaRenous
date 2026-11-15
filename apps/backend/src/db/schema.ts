import { sql } from "drizzle-orm"
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type {
  AnalysisQuality,
  ExteriorSpecs,
  InvoiceExtraction,
  KitchenSpecs,
} from "@casarenous/shared"

/* ========================================================================== */
/*  Enums                                                                     */
/* ========================================================================== */

export const userRoleEnum = pgEnum("user_role", ["admin", "invites"])
export const roomLevelEnum = pgEnum("room_level", ["rdc", "etage", "exterieur"])
export const keyDateKindEnum = pgEnum("key_date_kind", [
  "administratif",
  "technique",
  "chantier",
  "livraison",
])
export const milestoneCategoryEnum = pgEnum("milestone_category", [
  "administratif",
  "technique",
  "chantier",
  "livraison",
])
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "planned",
  "in_progress",
  "done",
  "late",
  "cancelled",
])
export const documentCategoryEnum = pgEnum("document_category", [
  "permis",
  "ccmi",
  "plan",
  "facture",
  "avenant",
  "assurance",
  "notice",
  "autre",
])
export const documentAnalysisStatusEnum = pgEnum("document_analysis_status", [
  "pending",
  "ready",
  "unsupported",
  "failed",
])
export const reserveSeverityEnum = pgEnum("reserve_severity", [
  "mineure",
  "majeure",
  "bloquante",
])
export const reserveStatusEnum = pgEnum("reserve_status", [
  "open",
  "in_progress",
  "resolved",
  "accepted",
])
export const budgetKindEnum = pgEnum("budget_kind", [
  "ccmi_call",
  "change_order",
  "invoice",
])
export const budgetStatusEnum = pgEnum("budget_status", [
  "planned",
  "due",
  "paid",
  "cancelled",
])

/* ========================================================================== */
/*  Auth                                                                      */
/* ========================================================================== */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRoleEnum("role").notNull().default("invites"),
  passwordHash: text("password_hash").notNull(),
  passwordVersion: integer("password_version").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
)

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    challengeHash: text("challenge_hash").notNull().unique(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("otp_user_idx").on(table.userId),
    index("otp_expiry_idx").on(table.expiresAt),
  ],
)

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: userRoleEnum("role").notNull().default("invites"),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invitations_email_idx").on(table.email),
    index("invitations_expiry_idx").on(table.expiresAt),
  ],
)

export const registrationChallenges = pgTable(
  "registration_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    challengeHash: text("challenge_hash").notNull().unique(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("registration_challenge_expiry_idx").on(table.expiresAt),
    index("registration_challenge_email_idx").on(table.email),
  ],
)

export const calendarTokens = pgTable("calendar_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    meta: jsonb("meta").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_created_idx").on(table.createdAt)],
)

/* ========================================================================== */
/*  Projet & pièces                                                           */
/* ========================================================================== */

export const projectProfile = pgTable(
  "project_profile",
  {
    id: smallint("id").primaryKey().default(1),
    name: text("name").notNull(),
    footprintWidthM: numeric("footprint_width_m", { precision: 4, scale: 2 }).notNull(),
    footprintDepthM: numeric("footprint_depth_m", { precision: 4, scale: 2 }).notNull(),
    levels: integer("levels").notNull().default(2),
    kitchenSpecs: jsonb("kitchen_specs").$type<KitchenSpecs>().notNull(),
    exteriorSpecs: jsonb("exterior_specs").$type<ExteriorSpecs>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("project_profile_singleton", sql`${table.id} = 1`)],
)

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    level: roomLevelEnum("level").notNull(),
    areaM2: numeric("area_m2", { precision: 6, scale: 2 }),
    ceilingHeightM: numeric("ceiling_height_m", { precision: 4, scale: 2 }),
    dimensions: text("dimensions"),
    description: text("description"),
    features: text("features").array().notNull().default(sql`'{}'::text[]`),
    specs: jsonb("specs").$type<Record<string, unknown> | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("rooms_level_idx").on(table.level, table.sortOrder),
    check("rooms_area_positive", sql`${table.areaM2} IS NULL OR ${table.areaM2} > 0`),
  ],
)

/* ========================================================================== */
/*  Dates clés & planning                                                     */
/* ========================================================================== */

export const keyDates = pgTable(
  "key_dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    label: text("label").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    kind: keyDateKindEnum("kind").notNull(),
    note: text("note"),
    isProvisional: boolean("is_provisional").notNull().default(true),
    completedOn: date("completed_on", { mode: "string" }),
    isSystem: boolean("is_system").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("key_dates_date_idx").on(table.date),
    check(
      "key_dates_horizon",
      sql`${table.date} >= DATE '2024-01-01' AND ${table.date} <= DATE '2028-12-31'`,
    ),
  ],
)

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique(),
    title: text("title").notNull(),
    description: text("description"),
    category: milestoneCategoryEnum("category").notNull(),
    status: milestoneStatusEnum("status").notNull().default("planned"),
    plannedStart: date("planned_start", { mode: "string" }).notNull(),
    plannedEnd: date("planned_end", { mode: "string" }).notNull(),
    actualDate: date("actual_date", { mode: "string" }),
    isKey: boolean("is_key").notNull().default(false),
    notifyDays: integer("notify_days").array().notNull().default(sql`'{7,1}'::integer[]`),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("milestones_end_idx").on(table.plannedEnd, table.status),
    check(
      "milestones_horizon",
      sql`${table.plannedEnd} >= DATE '2024-01-01' AND ${table.plannedEnd} <= DATE '2028-12-31'`,
    ),
    check("milestones_order", sql`${table.plannedEnd} >= ${table.plannedStart}`),
  ],
)

/* ========================================================================== */
/*  Coffre-fort, journal, réserves                                            */
/* ========================================================================== */

export const documentCategories = pgTable(
  "document_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("document_categories_name_idx").on(sql`lower(${table.name})`),
  ],
)

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    category: documentCategoryEnum("category").notNull(),
    customCategoryId: uuid("custom_category_id").references(
      () => documentCategories.id,
      { onDelete: "set null" },
    ),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    originalName: text("original_name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    encIv: text("enc_iv").notNull(),
    encTag: text("enc_tag").notNull(),
    encKeyVersion: integer("enc_key_version").notNull().default(1),
    magicVerified: boolean("magic_verified").notNull().default(false),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_category_idx").on(table.category, table.createdAt),
    index("documents_sha_idx").on(table.sha256),
    check("documents_size", sql`${table.sizeBytes} > 0`),
  ],
)

/**
 * Résultat de la lecture automatique d'un document. Une ligne par document :
 * relancer l'analyse remplace le résultat précédent (onConflict sur document_id).
 */
export const documentAnalyses = pgTable(
  "document_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: documentAnalysisStatusEnum("status").notNull(),
    engine: text("engine").notNull(),
    textLength: integer("text_length").notNull().default(0),
    extraction: jsonb("extraction").$type<InvoiceExtraction | null>(),
    quality: jsonb("quality").$type<AnalysisQuality | null>(),
    message: text("message"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("document_analyses_document_idx").on(table.documentId),
  ],
)

export const sitePhotos = pgTable(
  "site_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caption: text("caption"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    accuracyM: numeric("accuracy_m", { precision: 10, scale: 2 }),
    storageKey: text("storage_key").notNull().unique(),
    thumbKey: text("thumb_key"),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    encIv: text("enc_iv").notNull(),
    encTag: text("enc_tag").notNull(),
    thumbEncIv: text("thumb_enc_iv"),
    thumbEncTag: text("thumb_enc_tag"),
    encKeyVersion: integer("enc_key_version").notNull().default(1),
    magicVerified: boolean("magic_verified").notNull().default(false),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    clientId: uuid("client_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("photos_taken_idx").on(table.takenAt),
    index("photos_room_idx").on(table.roomId),
    check("photos_size", sql`${table.sizeBytes} > 0`),
    check(
      "photos_coordinates",
      sql`(${table.lat} IS NULL AND ${table.lng} IS NULL) OR (${table.lat} BETWEEN -90 AND 90 AND ${table.lng} BETWEEN -180 AND 180)`,
    ),
  ],
)

export const siteNotes = pgTable(
  "site_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    body: text("body").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    clientId: uuid("client_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("notes_taken_idx").on(table.takenAt)],
)

export const reserves = pgTable(
  "reserves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    location: text("location"),
    severity: reserveSeverityEnum("severity").notNull().default("mineure"),
    status: reserveStatusEnum("status").notNull().default("open"),
    dueDate: date("due_date", { mode: "string" }),
    photoId: uuid("photo_id").references(() => sitePhotos.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    clientId: uuid("client_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("reserves_status_idx").on(table.status, table.dueDate)],
)

/* ========================================================================== */
/*  Budget                                                                    */
/* ========================================================================== */

export const budgetItems = pgTable(
  "budget_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: budgetKindEnum("kind").notNull(),
    label: text("label").notNull(),
    reference: text("reference"),
    amountCents: integer("amount_cents"),
    dueDate: date("due_date", { mode: "string" }),
    paidAt: date("paid_at", { mode: "string" }),
    status: budgetStatusEnum("status").notNull().default("planned"),
    attachmentDocumentId: uuid("attachment_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("budget_due_idx").on(table.dueDate, table.status),
    check("budget_amount_nonzero", sql`${table.amountCents} <> 0`),
    check(
      "budget_ccmi_positive",
      sql`${table.kind} <> 'ccmi_call' OR ${table.amountCents} > 0`,
    ),
  ],
)

/* ========================================================================== */
/*  Push                                                                      */
/* ========================================================================== */

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("push_user_idx").on(table.userId)],
)

export const pushDeliveries = pgTable(
  "push_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("push_delivery_unique").on(table.subscriptionId, table.dedupeKey),
    index("push_delivery_status_idx").on(table.status, table.createdAt),
  ],
)

/* ========================================================================== */
/*  Types internes                                                            */
/* ========================================================================== */

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type RoomRow = typeof rooms.$inferSelect
export type KeyDateRow = typeof keyDates.$inferSelect
export type MilestoneRow = typeof milestones.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type DocumentCategoryRow = typeof documentCategories.$inferSelect
export type DocumentAnalysisRow = typeof documentAnalyses.$inferSelect
export type PhotoRow = typeof sitePhotos.$inferSelect
export type NoteRow = typeof siteNotes.$inferSelect
export type ReserveRow = typeof reserves.$inferSelect
export type BudgetItemRow = typeof budgetItems.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type AuditRow = typeof auditLog.$inferSelect
export type InvitationRow = typeof invitations.$inferSelect
export type RegistrationChallengeRow = typeof registrationChallenges.$inferSelect
