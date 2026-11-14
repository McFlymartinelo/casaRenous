ALTER TYPE "public"."budget_kind" ADD VALUE 'invoice';--> statement-breakpoint
CREATE TABLE "document_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "custom_category_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "document_categories_name_idx" ON "document_categories" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_custom_category_id_document_categories_id_fk" FOREIGN KEY ("custom_category_id") REFERENCES "public"."document_categories"("id") ON DELETE set null ON UPDATE no action;