CREATE TYPE "public"."complexity" AS ENUM('EASY', 'TYPICAL', 'DIFFICULT');--> statement-breakpoint
CREATE TYPE "public"."registration_mode" AS ENUM('invite_only', 'open');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."timer_visibility" AS ENUM('full', 'minimized', 'hidden_time');--> statement-breakpoint
CREATE TYPE "public"."timing_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_key" text NOT NULL,
	"study_type_id" uuid,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_mode" "registration_mode" DEFAULT 'invite_only' NOT NULL,
	"email_verification_required" boolean DEFAULT false NOT NULL,
	"telemetry_enabled" boolean DEFAULT false NOT NULL,
	"instance_name" text DEFAULT 'RadTempo' NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer,
	"last_request" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"exclude_from_benchmark" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timing_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"study_type_id" uuid NOT NULL,
	"status" "timing_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"pause_started_at" timestamp with time zone,
	"paused_duration_ms" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"active_duration_ms" integer,
	"complexity" "complexity" DEFAULT 'TYPICAL' NOT NULL,
	"classification_finalized_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timing_entry_tags" (
	"timing_entry_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timing_pause_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timing_entry_id" uuid NOT NULL,
	"paused_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"disabled_at" timestamp with time zone,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"timer_visibility" timer_visibility DEFAULT 'full' NOT NULL,
	"keyboard_shortcuts_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_study_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"modality" text NOT NULL,
	"body_region" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_from_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_events" ADD CONSTRAINT "achievement_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_events" ADD CONSTRAINT "achievement_events_study_type_id_user_study_types_id_fk" FOREIGN KEY ("study_type_id") REFERENCES "public"."user_study_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timing_entries" ADD CONSTRAINT "timing_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timing_entries" ADD CONSTRAINT "timing_entries_study_type_id_user_study_types_id_fk" FOREIGN KEY ("study_type_id") REFERENCES "public"."user_study_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timing_entry_tags" ADD CONSTRAINT "timing_entry_tags_timing_entry_id_timing_entries_id_fk" FOREIGN KEY ("timing_entry_id") REFERENCES "public"."timing_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timing_entry_tags" ADD CONSTRAINT "timing_entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timing_pause_events" ADD CONSTRAINT "timing_pause_events_timing_entry_id_timing_entries_id_fk" FOREIGN KEY ("timing_entry_id") REFERENCES "public"."timing_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_study_types" ADD CONSTRAINT "user_study_types_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_events_unique_idx" ON "achievement_events" USING btree ("user_id","achievement_key",coalesce("study_type_id", '00000000-0000-0000-0000-000000000000'));--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_lower_name_idx" ON "tags" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "timing_entries_one_active_per_user" ON "timing_entries" USING btree ("user_id") WHERE "timing_entries"."status" IN ('ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE INDEX "timing_entries_user_id_idx" ON "timing_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timing_entries_study_type_id_idx" ON "timing_entries" USING btree ("study_type_id");--> statement-breakpoint
CREATE INDEX "timing_entries_finished_at_idx" ON "timing_entries" USING btree ("finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timing_entry_tags_pk" ON "timing_entry_tags" USING btree ("timing_entry_id","tag_id");