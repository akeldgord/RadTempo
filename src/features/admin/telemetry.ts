import os from "node:os";

/**
 * Canonical, exhaustive list of the fields RadTempo telemetry can ever send.
 * This is the single source of truth for both `sendTelemetry` and the admin
 * UI, which must show this exact list next to the telemetry toggle (see
 * `docs/privacy.md` and `docs/SPEC.md` "Telemetry").
 *
 * Never add a field here that identifies a user, a study, a duration, a
 * complexity rating, a tag, a clinical timestamp, an IP address, or any
 * free-text content.
 */
export const TELEMETRY_FIELDS: readonly string[] = [
  "app_version",
  "feature_flags",
  "aggregate_counts",
  "node_major_version",
  "platform",
];

/** Keys that must never appear in a telemetry payload, whatever else changes. */
export const TELEMETRY_FORBIDDEN_KEYS: readonly string[] = [
  "email",
  "user_id",
  "userId",
  "study_type",
  "studyType",
  "duration",
  "complexity",
  "tag",
  "tags",
  "ip",
  "ip_address",
  "name",
  "clinical_timestamp",
];

export type TelemetryPayload = {
  app_version: string;
  feature_flags: Record<string, boolean>;
  aggregate_counts: Record<string, number>;
  node_major_version: number;
  platform: string;
};

export type SendTelemetryInput = {
  enabled: boolean;
  appVersion: string;
  featureFlags?: Record<string, boolean>;
  aggregateCounts?: Record<string, number>;
};

/**
 * Fire-and-forget telemetry send. Does nothing unless telemetry is enabled
 * AND `TELEMETRY_ENDPOINT` is set. Never throws — a telemetry failure must
 * never affect application behavior. Sends only the allowed aggregate
 * fields listed in `TELEMETRY_FIELDS`, nothing per-user.
 */
export function sendTelemetry(input: SendTelemetryInput): void {
  if (!input.enabled) return;
  const endpoint = process.env.TELEMETRY_ENDPOINT;
  if (!endpoint) return;

  const payload: TelemetryPayload = {
    app_version: input.appVersion,
    feature_flags: input.featureFlags ?? {},
    aggregate_counts: input.aggregateCounts ?? {},
    node_major_version: Number(process.versions.node.split(".")[0]),
    platform: os.platform(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      // Fire-and-forget: telemetry must never surface an error to the caller.
    })
    .finally(() => clearTimeout(timeout));
}
