CREATE TYPE "public"."budget_kind" AS ENUM('ccmi_call', 'change_order');--> statement-breakpoint
CREATE TYPE "public"."budget_status" AS ENUM('planned', 'due', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_category" AS ENUM('permis', 'ccmi', 'plan', 'facture', 'avenant', 'assurance', 'notice', 'autre');--> statement-breakpoint
CREATE TYPE "public"."key_date_kind" AS ENUM('administratif', 'technique', 'chantier', 'livraison');--> statement-breakpoint
CREATE TYPE "public"."milestone_category" AS ENUM('administratif', 'technique', 'chantier', 'livraison');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'in_progress', 'done', 'late', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reserve_severity" AS ENUM('mineure', 'majeure', 'bloquante');--> statement-breakpoint
CREATE TYPE "public"."reserve_status" AS ENUM('open', 'in_progress', 'resolved', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."room_level" AS ENUM('rdc', 'etage', 'exterieur');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'invites');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"ip" text,
	"user_agent" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "budget_kind" NOT NULL,
	"label" text NOT NULL,
	"reference" text,
	"amount_cents" integer NOT NULL,
	"due_date" date,
	"paid_at" date,
	"status" "budget_status" DEFAULT 'planned' NOT NULL,
	"attachment_document_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "budget_items_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "budget_amount_nonzero" CHECK ("budget_items"."amount_cents" <> 0),
	CONSTRAINT "budget_ccmi_positive" CHECK ("budget_items"."kind" <> 'ccmi_call' OR "budget_items"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "calendar_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "calendar_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" "document_category" NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"enc_iv" text NOT NULL,
	"enc_tag" text NOT NULL,
	"enc_key_version" integer DEFAULT 1 NOT NULL,
	"magic_verified" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"room_id" uuid,
	"milestone_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "documents_size" CHECK ("documents"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "key_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"kind" "key_date_kind" NOT NULL,
	"note" text,
	"is_provisional" boolean DEFAULT true NOT NULL,
	"completed_on" date,
	"is_system" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "key_dates_slug_unique" UNIQUE("slug"),
	CONSTRAINT "key_dates_horizon" CHECK ("key_dates"."date" >= DATE '2024-01-01' AND "key_dates"."date" <= DATE '2028-12-31')
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"title" text NOT NULL,
	"description" text,
	"category" "milestone_category" NOT NULL,
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"planned_start" date NOT NULL,
	"planned_end" date NOT NULL,
	"actual_date" date,
	"is_key" boolean DEFAULT false NOT NULL,
	"notify_days" integer[] DEFAULT '{7,1}'::integer[] NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "milestones_horizon" CHECK ("milestones"."planned_end" >= DATE '2024-01-01' AND "milestones"."planned_end" <= DATE '2028-12-31'),
	CONSTRAINT "milestones_order" CHECK ("milestones"."planned_end" >= "milestones"."planned_start")
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_challenge_hash_unique" UNIQUE("challenge_hash")
);
--> statement-breakpoint
CREATE TABLE "project_profile" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"footprint_width_m" numeric(4, 2) NOT NULL,
	"footprint_depth_m" numeric(4, 2) NOT NULL,
	"levels" integer DEFAULT 2 NOT NULL,
	"kitchen_specs" jsonb NOT NULL,
	"exterior_specs" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_profile_singleton" CHECK ("project_profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"room_id" uuid,
	"location" text,
	"severity" "reserve_severity" DEFAULT 'mineure' NOT NULL,
	"status" "reserve_status" DEFAULT 'open' NOT NULL,
	"due_date" date,
	"photo_id" uuid,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"resolved_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reserves_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"level" "room_level" NOT NULL,
	"area_m2" numeric(6, 2),
	"ceiling_height_m" numeric(4, 2),
	"dimensions" text,
	"description" text,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"specs" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rooms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "rooms_area_positive" CHECK ("rooms"."area_m2" IS NULL OR "rooms"."area_m2" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "site_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"author_id" uuid NOT NULL,
	"room_id" uuid,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_notes_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "site_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caption" text,
	"taken_at" timestamp with time zone NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"accuracy_m" numeric(10, 2),
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"enc_iv" text NOT NULL,
	"enc_tag" text NOT NULL,
	"thumb_enc_iv" text,
	"thumb_enc_tag" text,
	"enc_key_version" integer DEFAULT 1 NOT NULL,
	"magic_verified" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"room_id" uuid,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "site_photos_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "photos_size" CHECK ("site_photos"."size_bytes" > 0),
	CONSTRAINT "photos_coordinates" CHECK (("site_photos"."lat" IS NULL AND "site_photos"."lng" IS NULL) OR ("site_photos"."lat" BETWEEN -90 AND 90 AND "site_photos"."lng" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'invites' NOT NULL,
	"password_hash" text NOT NULL,
	"password_version" integer DEFAULT 1 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_attachment_document_id_documents_id_fk" FOREIGN KEY ("attachment_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_dates" ADD CONSTRAINT "key_dates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserves" ADD CONSTRAINT "reserves_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserves" ADD CONSTRAINT "reserves_photo_id_site_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."site_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserves" ADD CONSTRAINT "reserves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserves" ADD CONSTRAINT "reserves_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notes" ADD CONSTRAINT "site_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_notes" ADD CONSTRAINT "site_notes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_photos" ADD CONSTRAINT "site_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_photos" ADD CONSTRAINT "site_photos_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "budget_due_idx" ON "budget_items" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "documents_sha_idx" ON "documents" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "key_dates_date_idx" ON "key_dates" USING btree ("date");--> statement-breakpoint
CREATE INDEX "milestones_end_idx" ON "milestones" USING btree ("planned_end","status");--> statement-breakpoint
CREATE INDEX "otp_user_idx" ON "otp_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_expiry_idx" ON "otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_delivery_unique" ON "push_deliveries" USING btree ("subscription_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "push_delivery_status_idx" ON "push_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reserves_status_idx" ON "reserves" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "rooms_level_idx" ON "rooms" USING btree ("level","sort_order");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notes_taken_idx" ON "site_notes" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "photos_taken_idx" ON "site_photos" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "photos_room_idx" ON "site_photos" USING btree ("room_id");