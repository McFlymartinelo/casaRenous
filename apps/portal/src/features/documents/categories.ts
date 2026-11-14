import type { DocumentCategory } from "@casarenous/shared"

export const BUILTIN_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "permis", label: "Permis" },
  { value: "ccmi", label: "CCMI" },
  { value: "plan", label: "Plan" },
  { value: "facture", label: "Facture" },
  { value: "avenant", label: "Avenant" },
  { value: "assurance", label: "Assurance" },
  { value: "notice", label: "Notice" },
  { value: "autre", label: "Autre" },
]

export const BUILTIN_LABEL = Object.fromEntries(
  BUILTIN_CATEGORIES.map((item) => [item.value, item.label]),
) as Record<DocumentCategory, string>
