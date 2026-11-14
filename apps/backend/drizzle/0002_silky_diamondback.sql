CREATE TYPE "public"."document_analysis_status" AS ENUM('pending', 'ready', 'unsupported', 'failed');--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "document_analysis_status" NOT NULL,
	"engine" text NOT NULL,
	"text_length" integer DEFAULT 0 NOT NULL,
	"extraction" jsonb,
	"message" text,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_analyses_document_idx" ON "document_analyses" USING btree ("document_id");