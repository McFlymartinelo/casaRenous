-- Mise à jour du calendrier réel du projet (novembre 2026).
-- Appliqué aux bases déjà semées ; les nouvelles bases repartent du seed.

INSERT INTO "key_dates" ("slug", "label", "date", "kind", "note", "is_provisional", "completed_on", "is_system")
VALUES (
  'signature-compromis',
  'Signature du compromis de vente',
  DATE '2026-10-19',
  'administratif',
  'Compromis signé chez le notaire, dépôt de garantie versé.',
  false,
  DATE '2026-10-19',
  true
)
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "date" = EXCLUDED."date",
  "kind" = EXCLUDED."kind",
  "note" = EXCLUDED."note",
  "is_provisional" = EXCLUDED."is_provisional",
  "completed_on" = EXCLUDED."completed_on",
  "updated_at" = now();
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2026-11-06', "is_provisional" = false, "completed_on" = DATE '2026-11-06', "note" = 'Contrat de construction signé. Point de départ administratif du projet.', "updated_at" = now() WHERE "slug" = 'signature-ccmi';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2026-11-30', "is_provisional" = true, "note" = 'Dépôt prévu fin novembre, à confirmer avec le maître d''œuvre.', "updated_at" = now() WHERE "slug" = 'depot-permis';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2027-03-01', "is_provisional" = true, "note" = 'Instruction standard de 3 mois à compter du dépôt.', "updated_at" = now() WHERE "slug" = 'permis-accorde';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2027-06-01', "is_provisional" = true, "note" = 'Démarrage estimé en juin, après purge des recours.', "updated_at" = now() WHERE "slug" = 'ouverture-chantier';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2027-09-30', "is_provisional" = true, "updated_at" = now() WHERE "slug" = 'gros-oeuvre';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2027-11-30', "is_provisional" = true, "updated_at" = now() WHERE "slug" = 'hors-eau';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2028-01-31', "is_provisional" = true, "updated_at" = now() WHERE "slug" = 'hors-air';
--> statement-breakpoint

UPDATE "key_dates" SET "label" = 'Fin du second œuvre', "date" = DATE '2028-04-30', "is_provisional" = true, "updated_at" = now() WHERE "slug" = 'second-oeuvre';
--> statement-breakpoint

UPDATE "key_dates" SET "date" = DATE '2028-06-01', "is_provisional" = true, "note" = 'Douze mois de chantier : réception et remise des clés.', "updated_at" = now() WHERE "slug" = 'livraison';
--> statement-breakpoint

INSERT INTO "milestones" ("slug", "title", "description", "category", "status", "planned_start", "planned_end", "actual_date", "is_key", "notify_days")
VALUES (
  'compromis',
  'Signature du compromis de vente',
  'Compromis signé chez le notaire, dépôt de garantie versé.',
  'administratif',
  'done',
  DATE '2026-10-19',
  DATE '2026-10-19',
  DATE '2026-10-19',
  true,
  ARRAY[0]
)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "status" = EXCLUDED."status",
  "planned_start" = EXCLUDED."planned_start",
  "planned_end" = EXCLUDED."planned_end",
  "actual_date" = EXCLUDED."actual_date",
  "is_key" = EXCLUDED."is_key",
  "notify_days" = EXCLUDED."notify_days",
  "updated_at" = now();
--> statement-breakpoint

UPDATE "milestones" SET "title" = 'Signature du CCMI', "status" = 'done', "planned_start" = DATE '2026-11-06', "planned_end" = DATE '2026-11-06', "actual_date" = DATE '2026-11-06', "is_key" = true, "notify_days" = ARRAY[0], "updated_at" = now() WHERE "slug" = 'ccmi';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2026-11-30', "planned_end" = DATE '2026-11-30', "updated_at" = now() WHERE "slug" = 'permis-depot';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2026-11-30', "planned_end" = DATE '2027-03-01', "updated_at" = now() WHERE "slug" = 'permis-instruction';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2027-03-01', "planned_end" = DATE '2027-03-01', "updated_at" = now() WHERE "slug" = 'permis-accord';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2027-06-01', "planned_end" = DATE '2027-06-01', "updated_at" = now() WHERE "slug" = 'ouverture-chantier';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2027-06-01', "planned_end" = DATE '2027-09-30', "updated_at" = now() WHERE "slug" = 'gros-oeuvre';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2027-09-30', "planned_end" = DATE '2027-11-30', "updated_at" = now() WHERE "slug" = 'hors-eau';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2027-11-30', "planned_end" = DATE '2028-01-31', "updated_at" = now() WHERE "slug" = 'hors-air';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2028-01-31', "planned_end" = DATE '2028-04-30', "updated_at" = now() WHERE "slug" = 'second-oeuvre';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2028-05-01', "planned_end" = DATE '2028-05-31', "updated_at" = now() WHERE "slug" = 'finitions';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2028-06-01', "planned_end" = DATE '2028-06-01', "updated_at" = now() WHERE "slug" = 'livraison';
--> statement-breakpoint

UPDATE "milestones" SET "planned_start" = DATE '2028-06-02', "planned_end" = DATE '2028-06-30', "updated_at" = now() WHERE "slug" = 'levee-reserves';
