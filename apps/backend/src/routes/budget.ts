import { Router } from "express"
import { and, desc, eq, isNull } from "drizzle-orm"
import {
  BudgetCreateInput,
  BudgetUpdateInput,
  IdParam,
  type BudgetResponse,
  type Env,
} from "@casarenous/shared"
import type { Database } from "../db/client.js"
import { budgetItems } from "../db/schema.js"
import { writeAudit } from "../lib/audit.js"
import { ApiError } from "../lib/errors.js"
import { asyncHandler, parseBody, parseParams } from "../lib/http.js"
import { toBudgetItem } from "../lib/serializers.js"
import { requireAuth, type AuthLocals } from "../middleware/require-auth.js"
import { requireRole } from "../middleware/require-role.js"

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function summary(rows: Awaited<ReturnType<typeof loadBudgetRows>>) {
  let ccmiCents = 0
  let changeOrdersCents = 0
  let paidCents = 0
  for (const row of rows) {
    if (row.kind === "ccmi_call") ccmiCents += row.amountCents
    else changeOrdersCents += row.amountCents
    if (row.status === "paid") paidCents += row.amountCents
  }
  const totalCents = ccmiCents + changeOrdersCents
  return {
    totalCents,
    ccmiCents,
    changeOrdersCents,
    paidCents,
    remainingCents: totalCents - paidCents,
    count: rows.length,
  }
}

async function loadBudgetRows(db: Database) {
  return db
    .select()
    .from(budgetItems)
    .where(isNull(budgetItems.deletedAt))
    .orderBy(desc(budgetItems.createdAt))
}

export function budgetRouter(db: Database, env: Env): Router {
  const router = Router()
  const auth = requireAuth(db, env)

  router.get(
    "/budget",
    auth,
    requireRole("admin", "invites"),
    asyncHandler(async (_req, res) => {
      const rows = await loadBudgetRows(db)
      const payload: BudgetResponse = {
        items: rows.map(toBudgetItem),
        summary: summary(rows),
      }
      res.json(payload)
    }),
  )

  router.post(
    "/budget/items",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = parseBody(BudgetCreateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(budgetItems)
        .where(eq(budgetItems.clientId, input.clientId))
        .limit(1)
      if (existing) {
        res.status(200).json(toBudgetItem(existing))
        return
      }

      const [created] = await db
        .insert(budgetItems)
        .values({
          kind: input.kind,
          label: input.label,
          reference: input.reference ?? null,
          amountCents: input.amountCents,
          dueDate: input.dueDate ?? null,
          paidAt: input.paidAt ?? null,
          status: input.status,
          attachmentDocumentId: input.attachmentDocumentId ?? null,
          notes: input.notes ?? null,
          createdBy: user.id,
          clientId: input.clientId,
        })
        .returning()
      if (!created) throw ApiError.internal("Enregistrement impossible", "budget_failed")

      await writeAudit(db, {
        actorId: user.id,
        action: "budget.created",
        entity: "budget_item",
        entityId: created.id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { kind: created.kind, amountCents: created.amountCents },
      })
      res.status(201).json(toBudgetItem(created))
    }),
  )

  router.patch(
    "/budget/items/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const input = parseBody(BudgetUpdateInput, req.body)
      const { user } = res.locals.auth as AuthLocals
      const [existing] = await db
        .select()
        .from(budgetItems)
        .where(and(eq(budgetItems.id, id), isNull(budgetItems.deletedAt)))
        .limit(1)
      if (!existing) throw ApiError.notFound("Mouvement introuvable", "budget_not_found")

      if (input.amountCents !== undefined) {
        if (input.amountCents === 0) {
          throw ApiError.unprocessable("Le montant ne peut pas être nul", {
            amountCents: ["Montant nul interdit"],
          })
        }
        if (existing.kind === "ccmi_call" && input.amountCents < 0) {
          throw ApiError.unprocessable("Un appel de fonds est toujours positif", {
            amountCents: ["Montant négatif interdit pour un appel de fonds"],
          })
        }
      }

      const [updated] = await db
        .update(budgetItems)
        .set({
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.reference !== undefined ? { reference: input.reference } : {}),
          ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.attachmentDocumentId !== undefined
            ? { attachmentDocumentId: input.attachmentDocumentId }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(budgetItems.id, id))
        .returning()
      if (!updated) throw ApiError.notFound("Mouvement introuvable", "budget_not_found")

      await writeAudit(db, {
        actorId: user.id,
        action: "budget.updated",
        entity: "budget_item",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        meta: { fields: Object.keys(input) },
      })
      res.json(toBudgetItem(updated))
    }),
  )

  router.delete(
    "/budget/items/:id",
    auth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { id } = parseParams(IdParam, req.params)
      const { user } = res.locals.auth as AuthLocals
      const [updated] = await db
        .update(budgetItems)
        .set({ deletedAt: new Date() })
        .where(and(eq(budgetItems.id, id), isNull(budgetItems.deletedAt)))
        .returning({ id: budgetItems.id })
      if (!updated) throw ApiError.notFound("Mouvement introuvable", "budget_not_found")
      await writeAudit(db, {
        actorId: user.id,
        action: "budget.deleted",
        entity: "budget_item",
        entityId: id,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
      })
      res.json({ ok: true })
    }),
  )

  router.get(
    "/budget/export.csv",
    auth,
    requireRole("admin"),
    asyncHandler(async (_req, res) => {
      const rows = await loadBudgetRows(db)
      const header = [
        "Type",
        "Libellé",
        "Référence",
        "Montant (centimes)",
        "Montant (EUR)",
        "Échéance",
        "Payé le",
        "Statut",
        "Notes",
      ]
      const lines = [header.map(csvCell).join(";")]
      for (const row of rows) {
        lines.push(
          [
            row.kind,
            row.label,
            row.reference,
            row.amountCents,
            (row.amountCents / 100).toFixed(2).replace(".", ","),
            row.dueDate,
            row.paidAt,
            row.status,
            row.notes,
          ]
            .map(csvCell)
            .join(";"),
        )
      }
      const body = `\ufeff${lines.join("\r\n")}\r\n`
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="casarenous-budget.csv"')
      res.setHeader("Cache-Control", "private, no-store")
      res.send(body)
    }),
  )

  return router
}
