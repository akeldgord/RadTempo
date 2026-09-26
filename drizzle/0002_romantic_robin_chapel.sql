ALTER TABLE "timing_entries" DROP CONSTRAINT "timing_entries_study_type_id_user_study_types_id_fk";
--> statement-breakpoint
ALTER TABLE "user_study_types" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "timing_entries" ADD CONSTRAINT "timing_entries_study_type_id_user_study_types_id_fk" FOREIGN KEY ("study_type_id") REFERENCES "public"."user_study_types"("id") ON DELETE no action ON UPDATE no action;