import type {
  BudgetItem,
  Document,
  DocumentAnalysis,
  DocumentCategoryItem,
  KeyDate,
  Milestone,
  Note,
  Photo,
  ProjectProfile,
  Reserve,
  Room,
  UserPublic,
} from "@casarenous/shared"
import type {
  BudgetItemRow,
  DocumentAnalysisRow,
  DocumentCategoryRow,
  DocumentRow,
  KeyDateRow,
  MilestoneRow,
  NoteRow,
  PhotoRow,
  ReserveRow,
  RoomRow,
  UserRow,
} from "../db/schema.js"

function iso(value: Date): string {
  return value.toISOString()
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value)
}

export function toUserPublic(row: UserRow): UserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    createdAt: iso(row.createdAt),
  }
}

export function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    level: row.level,
    areaM2: numberOrNull(row.areaM2),
    ceilingHeightM: numberOrNull(row.ceilingHeightM),
    dimensions: row.dimensions,
    description: row.description,
    features: row.features ?? [],
    specs: row.specs ?? null,
    sortOrder: row.sortOrder,
  }
}

export function toProjectProfile(row: {
  id: number
  name: string
  footprintWidthM: string
  footprintDepthM: string
  levels: number
  kitchenSpecs: ProjectProfile["kitchenSpecs"]
  exteriorSpecs: ProjectProfile["exteriorSpecs"]
  updatedAt: Date
}): ProjectProfile {
  return {
    id: row.id,
    name: row.name,
    footprintWidthM: Number(row.footprintWidthM),
    footprintDepthM: Number(row.footprintDepthM),
    levels: row.levels,
    kitchenSpecs: row.kitchenSpecs,
    exteriorSpecs: row.exteriorSpecs,
    updatedAt: iso(row.updatedAt),
  }
}

export function toKeyDate(row: KeyDateRow): KeyDate {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    date: row.date,
    kind: row.kind,
    note: row.note,
    isProvisional: row.isProvisional,
    completedOn: row.completedOn,
    isSystem: row.isSystem,
    updatedAt: iso(row.updatedAt),
  }
}

export function toMilestone(row: MilestoneRow): Milestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    actualDate: row.actualDate,
    isKey: row.isKey,
    notifyDays: row.notifyDays ?? [],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toDocument(row: DocumentRow, customCategoryName: string | null = null): Document {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    customCategoryId: row.customCategoryId ?? null,
    customCategoryName,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    uploadedBy: row.uploadedBy,
    roomId: row.roomId,
    milestoneId: row.milestoneId,
    notes: row.notes,
    createdAt: iso(row.createdAt),
  }
}

export function toDocumentCategory(
  row: DocumentCategoryRow,
  documentCount = 0,
): DocumentCategoryItem {
  return {
    id: row.id,
    name: row.name,
    documentCount,
    createdAt: iso(row.createdAt),
  }
}

export function toDocumentAnalysis(row: DocumentAnalysisRow): DocumentAnalysis {
  return {
    documentId: row.documentId,
    status: row.status,
    engine: row.engine,
    textLength: row.textLength,
    extraction: row.extraction ?? null,
    message: row.message,
    analyzedAt: iso(row.analyzedAt),
  }
}

export function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    caption: row.caption,
    takenAt: iso(row.takenAt),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    accuracyM: numberOrNull(row.accuracyM),
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    roomId: row.roomId,
    createdAt: iso(row.createdAt),
  }
}

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    body: row.body,
    takenAt: iso(row.takenAt),
    authorId: row.authorId,
    roomId: row.roomId,
    createdAt: iso(row.createdAt),
  }
}

export function toReserve(row: ReserveRow): Reserve {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    roomId: row.roomId,
    location: row.location,
    severity: row.severity,
    status: row.status,
    dueDate: row.dueDate,
    photoId: row.photoId,
    createdBy: row.createdBy,
    assignedTo: row.assignedTo,
    resolvedAt: isoOrNull(row.resolvedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toBudgetItem(row: BudgetItemRow): BudgetItem {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    reference: row.reference,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    status: row.status,
    attachmentDocumentId: row.attachmentDocumentId,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
