import { z } from "zod"

/* ========================================================================== */
/*  1. Constantes projet                                                      */
/* ========================================================================== */

export const PROJECT_NAME = "CasaRenous"
export const PROJECT_HOST = "casarenous.martylab.fr"
export const PROJECT_END_DATE = "2028-12-31"
export const PROJECT_START_DATE = "2024-01-01"
export const SESSION_COOKIE = "cr_session"
export const OTP_COOKIE = "cr_otp"
export const REGISTRATION_COOKIE = "cr_reg"
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50

/* ========================================================================== */
/*  2. Primitives partagées                                                   */
/* ========================================================================== */

export const Uuid = z.string().uuid()

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine(isRealDate, "Date inexistante")

export const IsoDateTime = z
  .string()
  .datetime({ offset: true, message: "Date ISO 8601 avec fuseau attendue" })

export const MoneyCents = z
  .number()
  .int("Les montants sont stockés en centimes entiers")
  .min(-1_000_000_000, "Montant hors bornes")
  .max(1_000_000_000, "Montant hors bornes")

export const PageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}

export const IdParam = z.object({ id: Uuid })
export type IdParam = z.infer<typeof IdParam>

export const OkResponse = z.object({ ok: z.literal(true) })
export type OkResponse = z.infer<typeof OkResponse>

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  requestId: z.string(),
  details: z.record(z.string(), z.array(z.string())).optional(),
})
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>

/* ========================================================================== */
/*  3. Environnement                                                          */
/* ========================================================================== */

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    return ["1", "true", "yes", "on", "oui"].includes(value.toLowerCase())
  }
  return value
}, z.boolean())

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const OptionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().toLowerCase().email().optional(),
)
const OptionalText = z.preprocess(emptyToUndefined, z.string().optional())

const base64Key = z
  .string()
  .refine((value) => {
    try {
      return atob(value).length === 32
    } catch {
      return false
    }
  }, "Clé attendue : 32 octets encodés en base64")

const DEFAULT_DEV_FILE_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z
      .string()
      .url()
      .transform((value) => new URL(value).origin)
      .default("http://localhost:5173"),
    EXTRA_ORIGINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          .map((origin) => {
            try {
              return new URL(origin).origin
            } catch {
              return origin
            }
          }),
      ),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TZ: z.string().default("Europe/Paris"),

    DATABASE_URL: z
      .string()
      .min(1)
      .default("postgresql://casarenous:casarenous@localhost:5432/casarenous"),

    SESSION_SECRET: z.string().min(32, "SESSION_SECRET : 32 caractères minimum"),
    OTP_PEPPER: z
      .string()
      .min(32, "OTP_PEPPER : 32 caractères minimum")
      .default("dev-otp-pepper-change-me-32-characters"),
    FILE_ENCRYPTION_KEY: base64Key.default(DEFAULT_DEV_FILE_KEY),

    SESSION_TTL_SECONDS: z.coerce.number().int().min(3600).max(90 * 86400).default(14 * 86400),
    SESSION_IDLE_SECONDS: z.coerce.number().int().min(900).max(30 * 86400).default(86400),
    OTP_TTL_SECONDS: z.coerce.number().int().min(120).max(1800).default(600),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(30).max(600).default(60),

    COOKIE_SECURE: booleanFromEnv.default(false),

    MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
    SMTP_URL: OptionalText,
    MAIL_FROM: z.string().default("CasaRenous <no-reply@casarenous.martylab.fr>"),

    PUSH_ENABLED: booleanFromEnv.default(true),
    VAPID_PUBLIC_KEY: OptionalText,
    VAPID_PRIVATE_KEY: OptionalText,
    VAPID_SUBJECT: z.string().default("mailto:admin@casarenous.martylab.fr"),

    UPLOAD_DIR: z.string().default("./data/uploads"),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(20),

    POSTGRES_DB: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),

    SEED_ADMIN_EMAIL: OptionalEmail,
    SEED_ADMIN_NAME: OptionalText,
    SEED_ADMIN_PASSWORD: OptionalText,
    SEED_ADMIN_2_EMAIL: OptionalEmail,
    SEED_ADMIN_2_NAME: OptionalText,
    SEED_ADMIN_2_PASSWORD: OptionalText,
    SEED_INVITE_1_EMAIL: OptionalEmail,
    SEED_INVITE_1_NAME: OptionalText,
    SEED_INVITE_1_PASSWORD: OptionalText,
    SEED_INVITE_2_EMAIL: OptionalEmail,
    SEED_INVITE_2_NAME: OptionalText,
    SEED_INVITE_2_PASSWORD: OptionalText,
    SEED_ON_START: booleanFromEnv.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return

    if (!env.APP_ORIGIN.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_ORIGIN"],
        message: "APP_ORIGIN doit être une URL HTTPS en production",
      })
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE doit être true en production",
      })
    }
    if (env.MAIL_TRANSPORT === "console") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_TRANSPORT"],
        message: "Le mailer console est interdit en production",
      })
    }
    if (env.MAIL_TRANSPORT === "smtp" && !env.SMTP_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_URL"],
        message: "SMTP_URL est obligatoire avec MAIL_TRANSPORT=smtp",
      })
    }
    const placeholder = /remplace|change[-_ ]?me|example|placeholder/i
    if (
      env.OTP_PEPPER.includes("change-me") ||
      env.OTP_PEPPER.length < 43 ||
      placeholder.test(env.OTP_PEPPER)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OTP_PEPPER"],
        message: "OTP_PEPPER doit être un secret réel d'au moins 43 caractères en production",
      })
    }
    if (placeholder.test(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET contient encore une valeur d'exemple",
      })
    }
    if (
      env.POSTGRES_PASSWORD !== undefined &&
      (env.POSTGRES_PASSWORD.length < 16 || placeholder.test(env.POSTGRES_PASSWORD))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["POSTGRES_PASSWORD"],
        message: "POSTGRES_PASSWORD doit être un secret réel d'au moins 16 caractères",
      })
    }
    if (env.SESSION_SECRET.length < 43 || /^(.)\1+$/.test(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET doit être un secret aléatoire d'au moins 43 caractères",
      })
    }
    if (env.FILE_ENCRYPTION_KEY === DEFAULT_DEV_FILE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FILE_ENCRYPTION_KEY"],
        message: "FILE_ENCRYPTION_KEY de développement interdite en production",
      })
    }
    if (env.EXTRA_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EXTRA_ORIGINS"],
        message: "Les origines supplémentaires doivent être HTTPS en production",
      })
    }
    if (env.PUSH_ENABLED && (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VAPID_PUBLIC_KEY"],
        message: "Les clés VAPID sont obligatoires quand PUSH_ENABLED=true",
      })
    }
  })

export type Env = z.infer<typeof EnvSchema>

/* ========================================================================== */
/*  4. Auth & rôles                                                           */
/* ========================================================================== */

export const Role = z.enum(["admin", "invites"])
export type Role = z.infer<typeof Role>

export const UserPublic = z.object({
  id: Uuid,
  email: z.string().email(),
  displayName: z.string(),
  role: Role,
  createdAt: IsoDateTime,
})
export type UserPublic = z.infer<typeof UserPublic>

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  password: z.string().min(1, "Mot de passe requis").max(300),
})
export type LoginInput = z.infer<typeof LoginInput>

export const OtpVerifyInput = z.object({
  code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres attendu"),
})
export type OtpVerifyInput = z.infer<typeof OtpVerifyInput>

export const StrongPassword = z
  .string()
  .min(12, "12 caractères minimum")
  .max(300)
  .superRefine((value, ctx) => {
    const classes = [
      /[a-z]/.test(value),
      /[A-Z]/.test(value),
      /\d/.test(value),
      /[^A-Za-z0-9]/.test(value),
    ].filter(Boolean).length
    if (classes < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Utilise au moins 3 familles : minuscules, majuscules, chiffres, symboles",
      })
    }
  })

export const PasswordChangeInput = z.object({
  currentPassword: z.string().min(1).max(300),
  newPassword: StrongPassword,
})
export type PasswordChangeInput = z.infer<typeof PasswordChangeInput>

export const RegisterRequestInput = z.object({
  invitationCode: z.string().trim().min(20, "Code d'invitation invalide").max(200),
  email: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  displayName: z.string().trim().min(2, "Nom trop court").max(120),
  password: StrongPassword,
})
export type RegisterRequestInput = z.infer<typeof RegisterRequestInput>

export const RegisterVerifyInput = OtpVerifyInput
export type RegisterVerifyInput = z.infer<typeof RegisterVerifyInput>

export const LoginResponse = z.object({
  needsOtp: z.literal(true),
  emailMasked: z.string(),
  /** Uniquement avec MAIL_TRANSPORT=console hors production. */
  devCode: z.string().length(6).optional(),
})
export type LoginResponse = z.infer<typeof LoginResponse>

export const OtpResendResponse = z.object({
  ok: z.literal(true),
  retryAfterSeconds: z.number().int(),
  devCode: z.string().length(6).optional(),
})
export type OtpResendResponse = z.infer<typeof OtpResendResponse>

export const AuthSessionResponse = z.object({ user: UserPublic })
export type AuthSessionResponse = z.infer<typeof AuthSessionResponse>

export const SessionSummary = z.object({
  id: Uuid,
  createdAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
})
export type SessionSummary = z.infer<typeof SessionSummary>

export const SessionListSchema = z.array(SessionSummary)

export const InvitationSchema = z.object({
  id: Uuid,
  email: z.string().email(),
  displayName: z.string(),
  role: Role,
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  usedAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
})
export type Invitation = z.infer<typeof InvitationSchema>

export const InvitationCreateInput = z.object({
  email: z.string().trim().toLowerCase().email("Adresse email invalide").max(254),
  displayName: z.string().trim().min(2, "Nom trop court").max(120),
  role: Role.default("invites"),
})
export type InvitationCreateInput = z.infer<typeof InvitationCreateInput>

export const InvitationCreatedResponse = z.object({
  invitation: InvitationSchema,
  code: z.string(),
  emailSent: z.boolean(),
})
export type InvitationCreatedResponse = z.infer<typeof InvitationCreatedResponse>

export const InvitationListSchema = z.array(InvitationSchema)

/* ========================================================================== */
/*  5. Projet & pièces                                                        */
/* ========================================================================== */

export const RoomLevel = z.enum(["rdc", "etage", "exterieur"])
export type RoomLevel = z.infer<typeof RoomLevel>

export const KitchenSpecsSchema = z.object({
  facades: z.string(),
  worktop: z.string(),
  credence: z.string(),
  island: z.object({
    return: z.string(),
    seats: z.number().int().min(0).max(12),
  }),
  wineCellar: z.boolean(),
  appliances: z.array(z.string()),
  lighting: z.string(),
  notes: z.string().optional(),
})
export type KitchenSpecs = z.infer<typeof KitchenSpecsSchema>

export const ExteriorSpecsSchema = z.object({
  finish: z.string(),
  roof: z.string(),
  joinery: z.string(),
  shutters: z.string(),
  terrace: z.string(),
  notes: z.string().optional(),
})
export type ExteriorSpecs = z.infer<typeof ExteriorSpecsSchema>

export const ProjectProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  footprintWidthM: z.number(),
  footprintDepthM: z.number(),
  levels: z.number().int(),
  kitchenSpecs: KitchenSpecsSchema,
  exteriorSpecs: ExteriorSpecsSchema,
  updatedAt: IsoDateTime,
})
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>

export const RoomSchema = z.object({
  id: Uuid,
  slug: z.string(),
  name: z.string(),
  level: RoomLevel,
  areaM2: z.number().nullable(),
  ceilingHeightM: z.number().nullable(),
  dimensions: z.string().nullable(),
  description: z.string().nullable(),
  features: z.array(z.string()),
  specs: z.record(z.string(), z.unknown()).nullable(),
  sortOrder: z.number().int(),
})
export type Room = z.infer<typeof RoomSchema>

export const RoomListSchema = z.array(RoomSchema)

export const RoomUpdateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  level: RoomLevel.optional(),
  areaM2: z.number().min(0).max(1000).nullable().optional(),
  ceilingHeightM: z.number().min(1).max(6).nullable().optional(),
  dimensions: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  features: z.array(z.string().max(120)).max(30).optional(),
  specs: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
})
export type RoomUpdateInput = z.infer<typeof RoomUpdateInput>

export interface RoomProgramItem {
  slug: string
  name: string
  level: RoomLevel
  areaM2: number | null
  features: string[]
  description?: string
}

export const ROOM_PROGRAM: readonly RoomProgramItem[] = [
  {
    slug: "piece-de-vie",
    name: "Pièce de vie",
    level: "rdc",
    areaM2: 41.11,
    features: ["Cuisine ouverte", "Îlot 3 places", "Cave à vin", "Accès terrasse"],
    description:
      "Le cœur de la maison : séjour, salle à manger et cuisine ouverte avec îlot central.",
  },
  {
    slug: "entree",
    name: "Entrée",
    level: "rdc",
    areaM2: 2.24,
    features: ["Rangement", "Accès garage"],
  },
  {
    slug: "cellier",
    name: "Cellier",
    level: "rdc",
    areaM2: 4.27,
    features: ["Buanderie", "Stockage"],
  },
  {
    slug: "garage",
    name: "Garage",
    level: "rdc",
    areaM2: 14.38,
    features: ["Porte motorisée", "Accès maison"],
  },
  {
    slug: "chambre-1",
    name: "Chambre 1",
    level: "rdc",
    areaM2: 9.98,
    features: ["Volets roulants motorisés"],
  },
  {
    slug: "salle-d-eau-rdc",
    name: "Salle d'Eau",
    level: "rdc",
    areaM2: 2.32,
    features: ["Douche", "WC"],
  },
  {
    slug: "degagement",
    name: "Dégagement",
    level: "etage",
    areaM2: 10.09,
    features: ["Distribution des chambres"],
  },
  {
    slug: "chambre-parentale",
    name: "Chambre parentale",
    level: "etage",
    areaM2: 12.92,
    features: ["Dressing", "Salle d'eau privative"],
  },
  {
    slug: "dressing",
    name: "Dressing",
    level: "etage",
    areaM2: 4.38,
    features: ["Rangements sur mesure"],
  },
  {
    slug: "salle-d-eau-privative",
    name: "Salle d'Eau privative",
    level: "etage",
    areaM2: 4.25,
    features: ["Douche", "Meuble vasque"],
  },
  {
    slug: "chambre-2",
    name: "Chambre 2",
    level: "etage",
    areaM2: 13.23,
    features: ["Volets roulants motorisés"],
  },
  {
    slug: "chambre-3",
    name: "Chambre 3",
    level: "etage",
    areaM2: 12.87,
    features: ["Volets roulants motorisés"],
  },
  {
    slug: "chambre-4",
    name: "Chambre 4",
    level: "etage",
    areaM2: 12.08,
    features: ["Volets roulants motorisés"],
  },
  {
    slug: "salle-de-bain",
    name: "Salle de bain",
    level: "etage",
    areaM2: 4.63,
    features: ["Baignoire", "Meuble vasque"],
  },
  {
    slug: "wc",
    name: "WC",
    level: "etage",
    areaM2: 1.27,
    features: ["WC suspendu"],
  },
  {
    slug: "terrasse-bois",
    name: "Terrasse bois",
    level: "exterieur",
    areaM2: null,
    features: ["Lames bois", "Accès pièce de vie"],
  },
]

export const DEFAULT_KITCHEN_SPECS: KitchenSpecs = {
  facades: "Beige / crème, sans poignées",
  worktop: "Effet marbre blanc veiné doré",
  credence: "Effet marbre blanc veiné doré",
  island: { return: "Bois clair", seats: 3 },
  wineCellar: true,
  appliances: [
    "Four et micro-ondes noirs",
    "Hotte inclinée noire",
    "Cave à vin intégrée",
  ],
  lighting: "3 suspensions sphériques noires",
}

export const DEFAULT_EXTERIOR_SPECS: ExteriorSpecs = {
  finish: "Enduit clair",
  roof: "Toiture deux pans, tuiles",
  joinery: "Menuiseries blanches / grises",
  shutters: "Volets roulants motorisés (VR MOT)",
  terrace: "Terrasse bois à l'arrière",
}

/* ========================================================================== */
/*  6. Dates clés                                                             */
/* ========================================================================== */

export const KeyDateKind = z.enum(["administratif", "technique", "chantier", "livraison"])
export type KeyDateKind = z.infer<typeof KeyDateKind>

const DeadlineDate = IsoDate.refine(
  (value) => value >= PROJECT_START_DATE && value <= PROJECT_END_DATE,
  `Date attendue entre ${PROJECT_START_DATE} et ${PROJECT_END_DATE}`,
)

export const KeyDateSchema = z.object({
  id: Uuid,
  slug: z.string(),
  label: z.string(),
  date: IsoDate,
  kind: KeyDateKind,
  note: z.string().nullable(),
  isProvisional: z.boolean(),
  completedOn: IsoDate.nullable(),
  isSystem: z.boolean(),
  updatedAt: IsoDateTime,
})
export type KeyDate = z.infer<typeof KeyDateSchema>

export const KeyDateListSchema = z.array(KeyDateSchema)

export const KeyDateCreateInput = z.object({
  label: z.string().trim().min(2).max(120),
  date: DeadlineDate,
  kind: KeyDateKind,
  note: z.string().max(1000).nullable().optional(),
  isProvisional: z.boolean().default(true),
  completedOn: IsoDate.nullable().optional(),
})
export type KeyDateCreateInput = z.infer<typeof KeyDateCreateInput>

export const KeyDateUpdateInput = z.object({
  label: z.string().trim().min(2).max(120).optional(),
  date: DeadlineDate.optional(),
  kind: KeyDateKind.optional(),
  note: z.string().max(1000).nullable().optional(),
  isProvisional: z.boolean().optional(),
  completedOn: IsoDate.nullable().optional(),
})
export type KeyDateUpdateInput = z.infer<typeof KeyDateUpdateInput>

/* ========================================================================== */
/*  7. Rétroplanning                                                          */
/* ========================================================================== */

export const MilestoneCategory = z.enum([
  "administratif",
  "technique",
  "chantier",
  "livraison",
])
export type MilestoneCategory = z.infer<typeof MilestoneCategory>

export const MilestoneStatus = z.enum([
  "planned",
  "in_progress",
  "done",
  "late",
  "cancelled",
])
export type MilestoneStatus = z.infer<typeof MilestoneStatus>

export const MilestoneSchema = z.object({
  id: Uuid,
  title: z.string(),
  description: z.string().nullable(),
  category: MilestoneCategory,
  status: MilestoneStatus,
  plannedStart: IsoDate,
  plannedEnd: IsoDate,
  actualDate: IsoDate.nullable(),
  isKey: z.boolean(),
  notifyDays: z.array(z.number().int().min(0).max(365)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Milestone = z.infer<typeof MilestoneSchema>

export const MilestoneListSchema = z.array(MilestoneSchema)

const milestoneShape = {
  title: z.string().trim().min(2).max(160),
  description: z.string().max(2000).nullable().optional(),
  category: MilestoneCategory,
  status: MilestoneStatus.default("planned"),
  plannedStart: DeadlineDate,
  plannedEnd: DeadlineDate,
  actualDate: IsoDate.nullable().optional(),
  isKey: z.boolean().default(false),
  notifyDays: z.array(z.number().int().min(0).max(365)).max(10).default([7, 1]),
}

export const MilestoneCreateInput = z
  .object(milestoneShape)
  .refine((value) => value.plannedEnd >= value.plannedStart, {
    message: "La fin doit être postérieure ou égale au début",
    path: ["plannedEnd"],
  })
export type MilestoneCreateInput = z.infer<typeof MilestoneCreateInput>

export const MilestoneUpdateInput = z
  .object({
    title: milestoneShape.title.optional(),
    description: milestoneShape.description,
    category: milestoneShape.category.optional(),
    status: milestoneShape.status.optional(),
    plannedStart: DeadlineDate.optional(),
    plannedEnd: DeadlineDate.optional(),
    actualDate: IsoDate.nullable().optional(),
    isKey: z.boolean().optional(),
    notifyDays: z.array(z.number().int().min(0).max(365)).max(10).optional(),
  })
  .refine(
    (value) =>
      value.plannedStart === undefined ||
      value.plannedEnd === undefined ||
      value.plannedEnd >= value.plannedStart,
    { message: "La fin doit être postérieure ou égale au début", path: ["plannedEnd"] },
  )
export type MilestoneUpdateInput = z.infer<typeof MilestoneUpdateInput>

export const MilestoneQuery = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  category: MilestoneCategory.optional(),
  status: MilestoneStatus.optional(),
})
export type MilestoneQuery = z.infer<typeof MilestoneQuery>

export const CalendarFeedQuery = z.object({
  token: z.string().min(20).max(200).optional(),
})

export const CalendarTokenMetadata = z.object({
  exists: z.boolean(),
  createdAt: IsoDateTime.nullable(),
  lastUsedAt: IsoDateTime.nullable(),
})
export type CalendarTokenMetadata = z.infer<typeof CalendarTokenMetadata>

export const CalendarFeedResponse = z.object({
  url: z.string().url(),
  createdAt: IsoDateTime,
})
export type CalendarFeedResponse = z.infer<typeof CalendarFeedResponse>

/* ========================================================================== */
/*  8. Coffre-fort, journal, réserves                                         */
/* ========================================================================== */

export const DocumentCategory = z.enum([
  "permis",
  "ccmi",
  "plan",
  "facture",
  "avenant",
  "assurance",
  "notice",
  "autre",
])
export type DocumentCategory = z.infer<typeof DocumentCategory>

export const DocumentSchema = z.object({
  id: Uuid,
  title: z.string(),
  category: DocumentCategory,
  customCategoryId: Uuid.nullable(),
  customCategoryName: z.string().nullable(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  originalName: z.string(),
  uploadedBy: Uuid,
  roomId: Uuid.nullable(),
  milestoneId: Uuid.nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTime,
})
export type Document = z.infer<typeof DocumentSchema>

export const DocumentUploadFields = z.object({
  title: z.string().trim().min(1).max(180),
  category: DocumentCategory.default("autre"),
  customCategoryId: Uuid.nullable().optional(),
  roomId: Uuid.nullable().optional(),
  milestoneId: Uuid.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})
export type DocumentUploadFields = z.infer<typeof DocumentUploadFields>

export const DocumentUpdateInput = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  category: DocumentCategory.optional(),
  customCategoryId: Uuid.nullable().optional(),
  roomId: Uuid.nullable().optional(),
  milestoneId: Uuid.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})
export type DocumentUpdateInput = z.infer<typeof DocumentUpdateInput>

export const DocumentQuery = PageQuery.extend({
  category: DocumentCategory.optional(),
  customCategoryId: Uuid.optional(),
  roomId: Uuid.optional(),
  q: z.string().trim().max(120).optional(),
})
export type DocumentQuery = z.infer<typeof DocumentQuery>

/* ── Catégories personnalisées de documents ───────────────────────────── */

export const DocumentCategorySchema = z.object({
  id: Uuid,
  name: z.string(),
  documentCount: z.number().int().min(0),
  createdAt: IsoDateTime,
})
export type DocumentCategoryItem = z.infer<typeof DocumentCategorySchema>

export const DocumentCategoriesResponse = z.object({
  items: z.array(DocumentCategorySchema),
})
export type DocumentCategoriesResponse = z.infer<typeof DocumentCategoriesResponse>

export const DocumentCategoryCreateInput = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(60, "Nom trop long"),
})
export type DocumentCategoryCreateInput = z.infer<typeof DocumentCategoryCreateInput>

export const DocumentCategoryUpdateInput = DocumentCategoryCreateInput
export type DocumentCategoryUpdateInput = z.infer<typeof DocumentCategoryUpdateInput>

export const DocumentPageSchema = paginated(DocumentSchema)

/* ── Lecture automatique des factures (moteur déterministe v0) ────────── */

export const InvoiceConfidence = z.enum(["high", "medium", "low", "missing"])
export type InvoiceConfidence = z.infer<typeof InvoiceConfidence>

export const InvoiceLineSchema = z.object({
  label: z.string().max(180),
  amountCents: MoneyCents,
})
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>

export const InvoiceConfidenceMap = z.object({
  supplierName: InvoiceConfidence,
  supplierTaxId: InvoiceConfidence,
  invoiceNumber: InvoiceConfidence,
  issuedOn: InvoiceConfidence,
  dueDate: InvoiceConfidence,
  totalCents: InvoiceConfidence,
  vatCents: InvoiceConfidence,
})
export type InvoiceConfidenceMap = z.infer<typeof InvoiceConfidenceMap>

export const InvoiceExtractionSchema = z.object({
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  issuedOn: IsoDate.nullable(),
  dueDate: IsoDate.nullable(),
  totalCents: MoneyCents.nullable(),
  vatCents: MoneyCents.nullable(),
  amountDueCents: MoneyCents.nullable(),
  currency: z.literal("EUR"),
  lineCount: z.number().int().min(0),
  lines: z.array(InvoiceLineSchema).max(100),
  confidence: InvoiceConfidenceMap,
  warnings: z.array(z.string().max(300)).max(20),
  summary: z.string().max(500),
})
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>

export const DocumentAnalysisStatus = z.enum([
  "pending",
  "ready",
  "unsupported",
  "failed",
])
export type DocumentAnalysisStatus = z.infer<typeof DocumentAnalysisStatus>

export const InvoiceField = z.enum([
  "supplierName",
  "supplierTaxId",
  "invoiceNumber",
  "issuedOn",
  "dueDate",
  "totalCents",
  "vatCents",
])
export type InvoiceField = z.infer<typeof InvoiceField>

/** Journal qualité : ce que le moteur n'a pas su lire, et les corrections. */
export const AnalysisQualitySchema = z.object({
  missingFields: z.array(InvoiceField).max(7),
  lowConfidenceFields: z.array(InvoiceField).max(7),
  hasAmount: z.boolean(),
  hasDueDate: z.boolean(),
  corrected: z.boolean(),
  correctedAmountCents: MoneyCents.nullable(),
})
export type AnalysisQuality = z.infer<typeof AnalysisQualitySchema>

export const DocumentAnalysisSchema = z.object({
  documentId: Uuid,
  status: DocumentAnalysisStatus,
  engine: z.string().max(60),
  textLength: z.number().int().min(0),
  extraction: InvoiceExtractionSchema.nullable(),
  quality: AnalysisQualitySchema.nullable(),
  message: z.string().nullable(),
  analyzedAt: IsoDateTime,
})
export type DocumentAnalysis = z.infer<typeof DocumentAnalysisSchema>

export const AnalysisFieldStat = z.object({
  field: InvoiceField,
  missing: z.number().int().min(0),
  low: z.number().int().min(0),
})
export type AnalysisFieldStat = z.infer<typeof AnalysisFieldStat>

export const AnalysisQualityRecent = z.object({
  documentId: Uuid,
  title: z.string(),
  status: DocumentAnalysisStatus,
  analyzedAt: IsoDateTime,
  missingFields: z.array(InvoiceField),
  corrected: z.boolean(),
})
export type AnalysisQualityRecent = z.infer<typeof AnalysisQualityRecent>

export const AnalysisQualitySummary = z.object({
  total: z.number().int().min(0),
  ready: z.number().int().min(0),
  unsupported: z.number().int().min(0),
  failed: z.number().int().min(0),
  corrected: z.number().int().min(0),
  missingAmount: z.number().int().min(0),
  missingDueDate: z.number().int().min(0),
  missingSupplier: z.number().int().min(0),
  fields: z.array(AnalysisFieldStat),
  recent: z.array(AnalysisQualityRecent).max(20),
})
export type AnalysisQualitySummary = z.infer<typeof AnalysisQualitySummary>

export const AnalysisCorrectionInput = z.object({
  amountCents: MoneyCents,
})
export type AnalysisCorrectionInput = z.infer<typeof AnalysisCorrectionInput>

export const PhotoSchema = z.object({
  id: Uuid,
  caption: z.string().nullable(),
  takenAt: IsoDateTime,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracyM: z.number().nullable(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  uploadedBy: Uuid,
  roomId: Uuid.nullable(),
  createdAt: IsoDateTime,
})
export type Photo = z.infer<typeof PhotoSchema>

const coordinate = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}

export const PhotoUploadFields = z
  .object({
    caption: z.string().trim().max(500).nullable().optional(),
    takenAt: IsoDateTime,
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    accuracyM: z.coerce.number().min(0).max(100000).optional(),
    roomId: Uuid.nullable().optional(),
    clientId: Uuid,
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: "Latitude et longitude vont ensemble",
    path: ["lng"],
  })
export type PhotoUploadFields = z.infer<typeof PhotoUploadFields>

export const PhotoUpdateInput = z.object({
  caption: z.string().trim().max(500).nullable().optional(),
  roomId: Uuid.nullable().optional(),
  ...coordinate,
})
export type PhotoUpdateInput = z.infer<typeof PhotoUpdateInput>

export const PhotoQuery = PageQuery.extend({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  roomId: Uuid.optional(),
})
export type PhotoQuery = z.infer<typeof PhotoQuery>

export const PhotoPageSchema = paginated(PhotoSchema)

export const NoteSchema = z.object({
  id: Uuid,
  body: z.string(),
  takenAt: IsoDateTime,
  authorId: Uuid,
  roomId: Uuid.nullable(),
  createdAt: IsoDateTime,
})
export type Note = z.infer<typeof NoteSchema>

export const NoteListSchema = z.array(NoteSchema)

export const NoteCreateInput = z.object({
  body: z.string().trim().min(1).max(5000),
  takenAt: IsoDateTime,
  roomId: Uuid.nullable().optional(),
  clientId: Uuid,
})
export type NoteCreateInput = z.infer<typeof NoteCreateInput>

export const NoteUpdateInput = z.object({
  body: z.string().trim().min(1).max(5000).optional(),
  roomId: Uuid.nullable().optional(),
})
export type NoteUpdateInput = z.infer<typeof NoteUpdateInput>

export const ReserveSeverity = z.enum(["mineure", "majeure", "bloquante"])
export type ReserveSeverity = z.infer<typeof ReserveSeverity>

export const ReserveStatus = z.enum(["open", "in_progress", "resolved", "accepted"])
export type ReserveStatus = z.infer<typeof ReserveStatus>

export const ReserveSchema = z.object({
  id: Uuid,
  title: z.string(),
  description: z.string().nullable(),
  roomId: Uuid.nullable(),
  location: z.string().nullable(),
  severity: ReserveSeverity,
  status: ReserveStatus,
  dueDate: IsoDate.nullable(),
  photoId: Uuid.nullable(),
  createdBy: Uuid,
  assignedTo: Uuid.nullable(),
  resolvedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Reserve = z.infer<typeof ReserveSchema>

export const ReserveCreateInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().max(5000).nullable().optional(),
  roomId: Uuid.nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  severity: ReserveSeverity.default("mineure"),
  status: ReserveStatus.default("open"),
  dueDate: IsoDate.nullable().optional(),
  photoId: Uuid.nullable().optional(),
  clientId: Uuid,
})
export type ReserveCreateInput = z.infer<typeof ReserveCreateInput>

export const ReserveUpdateInput = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().max(5000).nullable().optional(),
  roomId: Uuid.nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  severity: ReserveSeverity.optional(),
  status: ReserveStatus.optional(),
  dueDate: IsoDate.nullable().optional(),
  assignedTo: Uuid.nullable().optional(),
  resolvedAt: IsoDateTime.nullable().optional(),
})
export type ReserveUpdateInput = z.infer<typeof ReserveUpdateInput>

export const ReserveQuery = PageQuery.extend({
  status: ReserveStatus.optional(),
  severity: ReserveSeverity.optional(),
  roomId: Uuid.optional(),
})
export type ReserveQuery = z.infer<typeof ReserveQuery>

export const ReservePageSchema = paginated(ReserveSchema)

/* ========================================================================== */
/*  9. Budget                                                                 */
/* ========================================================================== */

export const BudgetKind = z.enum(["ccmi_call", "change_order", "invoice"])
export type BudgetKind = z.infer<typeof BudgetKind>

export const BudgetStatus = z.enum(["planned", "due", "paid", "cancelled"])
export type BudgetStatus = z.infer<typeof BudgetStatus>

export const BudgetItemSchema = z.object({
  id: Uuid,
  kind: BudgetKind,
  label: z.string(),
  reference: z.string().nullable(),
  /** `null` = ligne créée sans montant, à compléter plus tard. */
  amountCents: MoneyCents.nullable(),
  dueDate: IsoDate.nullable(),
  paidAt: IsoDate.nullable(),
  status: BudgetStatus,
  attachmentDocumentId: Uuid.nullable(),
  notes: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type BudgetItem = z.infer<typeof BudgetItemSchema>

export const BudgetCreateInput = z
  .object({
    kind: BudgetKind,
    label: z.string().trim().min(2).max(180),
    reference: z.string().max(120).nullable().optional(),
    amountCents: MoneyCents.nullable().optional(),
    dueDate: IsoDate.nullable().optional(),
    paidAt: IsoDate.nullable().optional(),
    status: BudgetStatus.default("planned"),
    attachmentDocumentId: Uuid.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    clientId: Uuid,
  })
  .refine((value) => value.amountCents == null || value.amountCents !== 0, {
    message: "Le montant ne peut pas être nul",
    path: ["amountCents"],
  })
  .refine((value) => value.kind !== "ccmi_call" || value.amountCents == null || value.amountCents > 0, {
    message: "Un appel de fonds est toujours positif",
    path: ["amountCents"],
  })
  .refine((value) => value.kind !== "invoice" || value.amountCents == null || value.amountCents > 0, {
    message: "Une facture d'achat est toujours positive",
    path: ["amountCents"],
  })
export type BudgetCreateInput = z.infer<typeof BudgetCreateInput>

/** Import en masse : échéancier CCMI ou tableau collé depuis un tableur. */
export const MAX_BULK_BUDGET_ITEMS = 60

export const BudgetBulkCreateInput = z.object({
  items: z
    .array(BudgetCreateInput)
    .min(1, "Aucune ligne à importer")
    .max(MAX_BULK_BUDGET_ITEMS, `Maximum ${MAX_BULK_BUDGET_ITEMS} lignes par import`),
})
export type BudgetBulkCreateInput = z.infer<typeof BudgetBulkCreateInput>

export const BudgetBulkResponse = z.object({
  items: z.array(BudgetItemSchema),
})
export type BudgetBulkResponse = z.infer<typeof BudgetBulkResponse>

export const BudgetUpdateInput = z.object({
  label: z.string().trim().min(2).max(180).optional(),
  reference: z.string().max(120).nullable().optional(),
  amountCents: MoneyCents.nullable().optional(),
  dueDate: IsoDate.nullable().optional(),
  paidAt: IsoDate.nullable().optional(),
  status: BudgetStatus.optional(),
  attachmentDocumentId: Uuid.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})
export type BudgetUpdateInput = z.infer<typeof BudgetUpdateInput>

export const BudgetSummary = z.object({
  totalCents: z.number().int(),
  ccmiCents: z.number().int(),
  changeOrdersCents: z.number().int(),
  invoiceCents: z.number().int(),
  paidCents: z.number().int(),
  remainingCents: z.number().int(),
  count: z.number().int(),
  /** Lignes sans montant, exclues des totaux. */
  pendingCount: z.number().int(),
})
export type BudgetSummary = z.infer<typeof BudgetSummary>

export const BudgetResponse = z.object({
  items: z.array(BudgetItemSchema),
  summary: BudgetSummary,
})
export type BudgetResponse = z.infer<typeof BudgetResponse>

/* ========================================================================== */
/* 10. Push                                                                   */
/* ========================================================================== */

export const PushSubscribeInput = z.object({
  endpoint: z.string().url().max(2000).startsWith("https://"),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(500),
    auth: z.string().min(8).max(200),
  }),
  quiet: z.boolean().optional(),
})
export type PushSubscribeInput = z.infer<typeof PushSubscribeInput>

export const PushUnsubscribeInput = z.object({
  endpoint: z.string().url().max(2000),
})
export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeInput>

export const PushVapidResponse = z.object({
  configured: z.boolean(),
  publicKey: z.string().nullable(),
})
export type PushVapidResponse = z.infer<typeof PushVapidResponse>

export const PushTestResponse = z.object({
  sent: z.number().int(),
  failed: z.number().int().optional(),
  skipped: z.boolean().optional(),
  reason: z.string().optional(),
})
export type PushTestResponse = z.infer<typeof PushTestResponse>

export const PushStatusResponse = z.object({
  configured: z.boolean(),
  subscriptions: z.number().int(),
})
export type PushStatusResponse = z.infer<typeof PushStatusResponse>

/* ========================================================================== */
/* 11. Admin & audit                                                          */
/* ========================================================================== */

export const AuditEntry = z.object({
  id: z.number().int(),
  actorId: Uuid.nullable(),
  action: z.string(),
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: IsoDateTime,
})
export type AuditEntry = z.infer<typeof AuditEntry>

export const AdminAuditQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/* ========================================================================== */
/* 12. Utilitaires monétaires (aucun flottant)                                */
/* ========================================================================== */

/**
 * Convertit une saisie humaine en centimes entiers.
 * Accepte « 1 234,56 € », « 1234.56 », « -500 », « 12,5 ».
 * Retourne null si la saisie est invalide.
 */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input
    .replace(/\u00a0/g, " ")
    .replace(/[€\s]/g, "")
    .replace(/,/g, ".")
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const negative = cleaned.startsWith("-")
  const [whole = "0", fraction = ""] = cleaned.replace("-", "").split(".")
  const centsPart = fraction.padEnd(2, "0").slice(0, 2)
  const cents = Number(whole) * 100 + Number(centsPart)
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`
}

/* ========================================================================== */
/* 13. Dates projet                                                           */
/* ========================================================================== */

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}
