/**
 * Validates the bundled-Caddy Docker Compose overlay from a clean
 * checkout: `docker compose -f docker-compose.yml -f docker-compose.caddy.yml
 * up -d` must not publish the app's port directly (only Caddy should be on
 * 80/443), and the Caddyfile it mounts must actually exist in the repo. See
 * docs/reverse-proxy.md.
 *
 * Requires Docker Compose >= 2.24 (the `!reset` merge operator). Skipped
 * entirely when `docker compose` is unavailable in this environment.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function dockerComposeAvailable(): boolean {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const DUMMY_ENV = {
  ...process.env,
  POSTGRES_PASSWORD: "test-password",
  AUTH_SECRET: "test-secret-test-secret-test-secret",
  APP_URL: "http://localhost:3000",
  DOMAIN: "radtempo.example.com",
};

type ComposePort = { target: number; published?: string };
type ComposeVolume = { target: string; source?: string };
type ComposeConfig = {
  services: Record<
    string,
    { ports?: ComposePort[]; volumes?: ComposeVolume[] }
  >;
};

function composeConfig(...files: string[]): ComposeConfig {
  const args = files
    .flatMap((f) => ["-f", f])
    .concat(["config", "--format", "json"]);
  const out = execFileSync("docker", ["compose", ...args], {
    cwd: ROOT,
    env: DUMMY_ENV,
    encoding: "utf8",
  });
  return JSON.parse(out) as ComposeConfig;
}

describe.skipIf(!dockerComposeAvailable())(
  "docker compose deployment config",
  () => {
    it("base compose publishes the app's host port directly", () => {
      const cfg = composeConfig("docker-compose.yml");
      const ports = cfg.services.app.ports ?? [];
      expect(ports.some((p) => p.target === 3000)).toBe(true);
    });

    it("caddy overlay removes the app's published ports and exposes 80/443 on caddy", () => {
      const cfg = composeConfig(
        "docker-compose.yml",
        "docker-compose.caddy.yml",
      );
      expect(cfg.services.app.ports ?? []).toHaveLength(0);

      const caddyPorts = (cfg.services.caddy.ports ?? []).map((p) =>
        Number(p.published),
      );
      expect(caddyPorts).toEqual(expect.arrayContaining([80, 443]));
    });

    it("the caddy overlay mounts a Caddyfile that exists in the repo", () => {
      const cfg = composeConfig(
        "docker-compose.yml",
        "docker-compose.caddy.yml",
      );
      const caddyVolumes = cfg.services.caddy.volumes ?? [];
      const caddyfileMount = caddyVolumes.find(
        (v) => v.target === "/etc/caddy/Caddyfile",
      );
      expect(caddyfileMount?.source).toBeTruthy();
      expect(fs.existsSync(caddyfileMount!.source as string)).toBe(true);
    });
  },
);

describe("Caddyfile validity (best-effort)", () => {
  it("validates docker/Caddyfile with the caddy image, skipping gracefully if it can't be pulled", () => {
    if (!dockerComposeAvailable()) return;
    const caddyfilePath = path.join(ROOT, "docker/Caddyfile");
    expect(fs.existsSync(caddyfilePath)).toBe(true);

    try {
      execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${caddyfilePath}:/etc/caddy/Caddyfile:ro`,
          "-e",
          "DOMAIN=radtempo.example.com",
          "caddy:2",
          "caddy",
          "validate",
          "--config",
          "/etc/caddy/Caddyfile",
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
    } catch (error) {
      const message = String(
        (error as { stderr?: string; message?: string })?.stderr ??
          (error as Error)?.message ??
          "",
      );
      // Docker Hub pulls can be rate-limited (429) or unreachable in CI/
      // sandboxed environments; treat failure to obtain the image as a
      // skip, not a test failure. Any other failure (e.g. an actually
      // invalid Caddyfile) still fails the test.
      if (
        /pull|429|too many requests|toomanyrequests|not found|cannot connect|network/i.test(
          message,
        )
      ) {
        console.warn(
          "Skipping Caddyfile validation (caddy image unavailable):",
          message.slice(0, 300),
        );
        return;
      }
      throw error;
    }
  });
});
