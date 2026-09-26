import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const timingStatusEnum = pgEnum("timing_status", [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
]);
export const complexityEnum = pgEnum("complexity", [
  "EASY",
  "TYPICAL",
  "DIFFICULT",
]);
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);
export const timerVisibilityEnum = pgEnum("timer_visibility", [
  "full",
  "minimized",
  "hidden_time",
]);
export const registrationModeEnum = pgEnum("registration_mode", [
  "invite_only",
  "open",
]);

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("USER"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rateLimit = pgTable("rate_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  count: integer("count"),
  // Better Auth stores this as a millisecond epoch timestamp (Date.now()),
  // which overflows a 32-bit integer — must be bigint, not integer.
  lastRequest: bigint("last_request", { mode: "number" }),
});

// ---------------------------------------------------------------------------
// Instance settings (single row)
// ---------------------------------------------------------------------------

export const instanceSettings = pgTable("instance_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  registrationMode: registrationModeEnum("registration_mode")
    .notNull()
    .default("invite_only"),
  emailVerificationRequired: boolean("email_verification_required")
    .notNull()
    .default(false),
  telemetryEnabled: boolean("telemetry_enabled").notNull().default(false),
  instanceName: text("instance_name").notNull().default("RadTempo"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email"),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  theme: themeEnum("theme").notNull().default("system"),
  timerVisibility: timerVisibilityEnum("timer_visibility")
    .notNull()
    .default("full"),
  keyboardShortcutsJson: jsonb("keyboard_shortcuts_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Study types
// ---------------------------------------------------------------------------

export const userStudyTypes = pgTable("user_study_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  modality: text("modality").notNull(),
  bodyRegion: text("body_region").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  favorite: boolean("favorite").notNull().default(false),
  createdFromTemplate: text("created_from_template"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Timing entries
// ---------------------------------------------------------------------------

export const timingEntries = pgTable(
  "timing_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    studyTypeId: uuid("study_type_id")
      .notNull()
      .references(() => userStudyTypes.id, { onDelete: "cascade" }),
    status: timingStatusEnum("status").notNull().default("ACTIVE"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    pauseStartedAt: timestamp("pause_started_at", { withTimezone: true }),
    pausedDurationMs: integer("paused_duration_ms").notNull().default(0),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    activeDurationMs: integer("active_duration_ms"),
    complexity: complexityEnum("complexity").notNull().default("TYPICAL"),
    classificationFinalizedAt: timestamp("classification_finalized_at", {
      withTimezone: true,
    }),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("timing_entries_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.status} IN ('ACTIVE', 'PAUSED')`),
    index("timing_entries_user_id_idx").on(table.userId),
    index("timing_entries_study_type_id_idx").on(table.studyTypeId),
    index("timing_entries_finished_at_idx").on(table.finishedAt),
  ],
);

export const timingPauseEvents = pgTable("timing_pause_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  timingEntryId: uuid("timing_entry_id")
    .notNull()
    .references(() => timingEntries.id, { onDelete: "cascade" }),
  pausedAt: timestamp("paused_at", { withTimezone: true }).notNull(),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    builtIn: boolean("built_in").notNull().default(false),
    excludeFromBenchmark: boolean("exclude_from_benchmark")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tags_user_id_lower_name_idx").on(
      table.userId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const timingEntryTags = pgTable(
  "timing_entry_tags",
  {
    timingEntryId: uuid("timing_entry_id")
      .notNull()
      .references(() => timingEntries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("timing_entry_tags_pk").on(table.timingEntryId, table.tagId),
  ],
);

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const achievementEvents = pgTable(
  "achievement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    achievementKey: text("achievement_key").notNull(),
    studyTypeId: uuid("study_type_id").references(() => userStudyTypes.id, {
      onDelete: "cascade",
    }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadataJson: jsonb("metadata_json"),
  },
  (table) => [
    uniqueIndex("achievement_events_unique_idx").on(
      table.userId,
      table.achievementKey,
      sql`coalesce(${table.studyTypeId}, '00000000-0000-0000-0000-000000000000')`,
    ),
  ],
);
