import { randomBytes } from "node:crypto"
import type { Env } from "@casarenous/shared"
import {
  DEFAULT_EXTERIOR_SPECS,
  DEFAULT_KITCHEN_SPECS,
  ROOM_PROGRAM,
} from "@casarenous/shared"
import type { Database } from "./client.js"
import {
  keyDates,
  milestones,
  projectProfile,
  rooms,
  users,
} from "./schema.js"
import { hashPassword } from "../lib/password.js"

export interface GeneratedCredential {
  email: string
  displayName: string
  role: "admin" | "invites"
  password: string
}

export interface SeedResult {
  generated: GeneratedCredential[]
}

function randomPassword(): string {
  return `${randomBytes(15).toString("base64url")}aA1!`
}

interface SeedUser {
  email: string
  displayName: string
  role: "admin" | "invites"
  password?: string
}

function requireInProduction(env: Env, value: string | undefined, name: string): string {
  if (value && value.length >= 12) return value
  if (env.NODE_ENV === "production") {
    throw new Error(`[seed] ${name} est obligatoire (12 caractères minimum) en production`)
  }
  return randomPassword()
}

export async function seedDatabase(db: Database, env: Env): Promise<SeedResult> {
  const candidates: SeedUser[] = [
    {
      email: (env.SEED_ADMIN_EMAIL ?? "admin@casarenous.fr").toLowerCase(),
      displayName: env.SEED_ADMIN_NAME ?? "Administrateur CasaRenous",
      role: "admin",
      password: requireInProduction(env, env.SEED_ADMIN_PASSWORD, "SEED_ADMIN_PASSWORD"),
    },
    ...(env.SEED_ADMIN_2_EMAIL
      ? [
          {
            email: env.SEED_ADMIN_2_EMAIL.toLowerCase(),
            displayName: env.SEED_ADMIN_2_NAME ?? "Second administrateur",
            role: "admin" as const,
            password: requireInProduction(
              env,
              env.SEED_ADMIN_2_PASSWORD,
              "SEED_ADMIN_2_PASSWORD",
            ),
          },
        ]
      : []),
    ...(env.SEED_INVITE_1_EMAIL
      ? [
          {
            email: env.SEED_INVITE_1_EMAIL.toLowerCase(),
            displayName: env.SEED_INVITE_1_NAME ?? "Mme Sévin",
            role: "invites" as const,
            password: requireInProduction(
              env,
              env.SEED_INVITE_1_PASSWORD,
              "SEED_INVITE_1_PASSWORD",
            ),
          },
        ]
      : []),
    ...(env.SEED_INVITE_2_EMAIL
      ? [
          {
            email: env.SEED_INVITE_2_EMAIL.toLowerCase(),
            displayName: env.SEED_INVITE_2_NAME ?? "M. Renous",
            role: "invites" as const,
            password: requireInProduction(
              env,
              env.SEED_INVITE_2_PASSWORD,
              "SEED_INVITE_2_PASSWORD",
            ),
          },
        ]
      : []),
  ]

  const deliverable = candidates.filter((candidate) => {
    if (
      env.NODE_ENV === "production" &&
      /@casarenous\.(fr|local)$/i.test(candidate.email)
    ) {
      console.warn(
        `[seed] ${candidate.email} ignoré : adresse factice, aucun OTP ne peut être reçu.`,
      )
      return false
    }
    return true
  })

  if (env.NODE_ENV === "production" && !deliverable.some((item) => item.role === "admin")) {
    throw new Error(
      "[seed] Aucun administrateur avec une adresse email réelle. " +
        "Renseigne SEED_ADMIN_EMAIL (ou SEED_ADMIN_2_EMAIL) avant de lancer le seed.",
    )
  }

  const generated: GeneratedCredential[] = []

  for (const candidate of deliverable) {
    const existing = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.email, candidate.email),
    })
    if (existing) continue

    const password = candidate.password ?? randomPassword()
    await db.insert(users).values({
      email: candidate.email,
      displayName: candidate.displayName,
      role: candidate.role,
      passwordHash: await hashPassword(password),
    })
    generated.push({
      email: candidate.email,
      displayName: candidate.displayName,
      role: candidate.role,
      password,
    })
  }

  await db
    .insert(projectProfile)
    .values({
      id: 1,
      name: "Maison Sévin – Renous",
      footprintWidthM: "7.10",
      footprintDepthM: "13.60",
      levels: 2,
      kitchenSpecs: DEFAULT_KITCHEN_SPECS,
      exteriorSpecs: DEFAULT_EXTERIOR_SPECS,
    })
    .onConflictDoUpdate({
      target: projectProfile.id,
      set: {
        name: "Maison Sévin – Renous",
        footprintWidthM: "7.10",
        footprintDepthM: "13.60",
        levels: 2,
        kitchenSpecs: DEFAULT_KITCHEN_SPECS,
        exteriorSpecs: DEFAULT_EXTERIOR_SPECS,
        updatedAt: new Date(),
      },
    })

  for (const [index, room] of ROOM_PROGRAM.entries()) {
    await db
      .insert(rooms)
      .values({
        slug: room.slug,
        name: room.name,
        level: room.level,
        areaM2: room.areaM2 === null ? null : room.areaM2.toFixed(2),
        description: room.description ?? null,
        features: room.features,
        sortOrder: index,
        specs: room.slug === "piece-de-vie" ? { kitchen: true } : null,
      })
      .onConflictDoNothing({ target: rooms.slug })
  }

  const dates = [
    {
      slug: "signature-ccmi",
      label: "Signature du CCMI",
      date: "2026-11-06",
      kind: "administratif" as const,
      note: "Contrat de construction signé. Point de départ administratif du projet.",
      isProvisional: false,
      completedOn: "2026-11-06",
    },
    {
      slug: "depot-permis",
      label: "Dépôt du permis de construire",
      date: "2026-11-20",
      kind: "administratif" as const,
      note: "Date prévisionnelle, à ajuster avec le maître d'œuvre.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "permis-accorde",
      label: "Obtention du permis de construire",
      date: "2027-02-19",
      kind: "administratif" as const,
      note: "Instruction standard de 3 mois, hors demandes de pièces.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "ouverture-chantier",
      label: "Ouverture de chantier",
      date: "2027-03-15",
      kind: "chantier" as const,
      note: "Démarrage des travaux après purges des recours.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "gros-oeuvre",
      label: "Fin du gros œuvre",
      date: "2027-07-15",
      kind: "chantier" as const,
      note: "Fondations, élévations, dalle et charpente.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "hors-eau",
      label: "Mise hors d'eau",
      date: "2027-10-15",
      kind: "technique" as const,
      note: "Toiture et menuiseries extérieures posées.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "hors-air",
      label: "Mise hors d'air",
      date: "2027-12-15",
      kind: "technique" as const,
      note: "Enveloppe fermée, chauffage et ventilation en place.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "second-oeuvre",
      label: "Fin des second œuvre",
      date: "2028-06-30",
      kind: "chantier" as const,
      note: "Cloisons, réseaux, isolation, chapes et revêtements.",
      isProvisional: true,
      completedOn: null,
    },
    {
      slug: "livraison",
      label: "Livraison de la maison",
      date: "2028-12-15",
      kind: "livraison" as const,
      note: "Réception, levée des réserves et remise des clés.",
      isProvisional: true,
      completedOn: null,
    },
  ]

  for (const item of dates) {
    await db
      .insert(keyDates)
      .values({ ...item, isSystem: true })
      .onConflictDoNothing({ target: keyDates.slug })
  }

  const planning = [
    {
      slug: "ccmi",
      title: "Signature du CCMI",
      description: "Contrat de construction de maison individuelle signé.",
      category: "administratif" as const,
      status: "done" as const,
      plannedStart: "2026-11-06",
      plannedEnd: "2026-11-06",
      actualDate: "2026-11-06",
      isKey: true,
      notifyDays: [0],
    },
    {
      slug: "permis-depot",
      title: "Dépôt du permis de construire",
      description: "Dossier déposé en mairie et accusé de réception obtenu.",
      category: "administratif" as const,
      status: "planned" as const,
      plannedStart: "2026-11-20",
      plannedEnd: "2026-11-20",
      isKey: true,
      notifyDays: [7, 1],
    },
    {
      slug: "permis-instruction",
      title: "Instruction du permis",
      description: "Période d'instruction et réponses aux demandes de pièces.",
      category: "administratif" as const,
      status: "planned" as const,
      plannedStart: "2026-11-20",
      plannedEnd: "2027-02-19",
      isKey: false,
      notifyDays: [30, 7],
    },
    {
      slug: "permis-accord",
      title: "Obtention du permis de construire",
      description: "Arrêté de permis accordé et purgé des recours.",
      category: "administratif" as const,
      status: "planned" as const,
      plannedStart: "2027-02-19",
      plannedEnd: "2027-02-19",
      isKey: true,
      notifyDays: [7, 1],
    },
    {
      slug: "ouverture-chantier",
      title: "Ouverture de chantier",
      description: "Déclaration d'ouverture et installation de chantier.",
      category: "chantier" as const,
      status: "planned" as const,
      plannedStart: "2027-03-15",
      plannedEnd: "2027-03-15",
      isKey: true,
      notifyDays: [30, 7, 1],
    },
    {
      slug: "gros-oeuvre",
      title: "Gros œuvre",
      description: "Terrassement, fondations, élévations, dalle et charpente.",
      category: "chantier" as const,
      status: "planned" as const,
      plannedStart: "2027-03-15",
      plannedEnd: "2027-07-15",
      isKey: false,
      notifyDays: [30, 7],
    },
    {
      slug: "hors-eau",
      title: "Mise hors d'eau",
      description: "Toiture, zinguerie et menuiseries extérieures.",
      category: "technique" as const,
      status: "planned" as const,
      plannedStart: "2027-07-15",
      plannedEnd: "2027-10-15",
      isKey: true,
      notifyDays: [30, 7],
    },
    {
      slug: "hors-air",
      title: "Mise hors d'air",
      description: "Enveloppe fermée, ventilation et chauffage.",
      category: "technique" as const,
      status: "planned" as const,
      plannedStart: "2027-10-15",
      plannedEnd: "2027-12-15",
      isKey: false,
      notifyDays: [30, 7],
    },
    {
      slug: "second-oeuvre",
      title: "Second œuvre",
      description: "Cloisons, réseaux, isolation, chapes, revêtements et cuisine.",
      category: "chantier" as const,
      status: "planned" as const,
      plannedStart: "2028-01-15",
      plannedEnd: "2028-06-30",
      isKey: false,
      notifyDays: [30, 7],
    },
    {
      slug: "finitions",
      title: "Finitions et essais",
      description: "Peintures, menuiseries intérieures, essais et nettoyage.",
      category: "chantier" as const,
      status: "planned" as const,
      plannedStart: "2028-07-01",
      plannedEnd: "2028-10-31",
      isKey: false,
      notifyDays: [30, 7],
    },
    {
      slug: "livraison",
      title: "Livraison de la maison",
      description: "Réception, réserves et remise des clés.",
      category: "livraison" as const,
      status: "planned" as const,
      plannedStart: "2028-12-15",
      plannedEnd: "2028-12-15",
      isKey: true,
      notifyDays: [90, 30, 7, 1],
    },
    {
      slug: "levee-reserves",
      title: "Levée des réserves",
      description: "Reprise des réserves signalées lors de la réception.",
      category: "livraison" as const,
      status: "planned" as const,
      plannedStart: "2028-12-16",
      plannedEnd: "2028-12-31",
      isKey: false,
      notifyDays: [7, 1],
    },
  ]

  for (const item of planning) {
    await db
      .insert(milestones)
      .values(item)
      .onConflictDoNothing({ target: milestones.slug })
  }

  return { generated }
}
