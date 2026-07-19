import {
  ACTIVE_PROFILE_KEY,
  LEGACY_DEFAULT_SOURCE_URL,
  OFFICIAL_SOURCE_URL,
  PROFILE_SOURCES_KEY,
} from "@SunReye/db/profiles";
import { defineProfile, metric, tryGetProfile } from "@SunReye/inverter-core";
import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ZodType } from "zod";

// The catalog persists sources/active-profile through the app-settings accessor
// and installed profiles through the DB; back both with in-memory stand-ins.
// Repo browsing/installing runs against a real local file:// git fixture (like
// git-source.test) — no module poisoning, no network.
const store = new Map<string, unknown>();
// Keys served raw (schema bypassed): the stored source list uses local file://
// fixture URLs, which the https-only profileSourceSchema would reject — and a
// fallback would re-enable the real official GitHub source (network!).
const rawKeys = new Set<string>();
async function readSetting<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T> {
  if (!store.has(key)) return fallback;
  if (rawKeys.has(key)) return store.get(key) as T;
  const parsed = schema.safeParse(store.get(key));
  return parsed.success ? parsed.data : fallback;
}
async function writeSetting<T>(key: string, value: T): Promise<void> {
  store.set(key, value);
}
function cachedSetting<T>(key: string, schema: ZodType<T>, fallback: T) {
  let cache: T | null = null;
  return {
    async get() {
      cache ??= await readSetting(key, schema, fallback);
      return cache;
    },
    async set(input: unknown) {
      cache = schema.parse(input);
      await writeSetting(key, cache);
      return cache;
    },
  };
}
mock.module("./app-settings", () => ({ readSetting, writeSetting, cachedSetting }));

interface InstalledRow {
  id: string;
  data: unknown;
  version: string;
  source: string;
  installedAt: Date;
}
let installedRows: InstalledRow[] = [];
let selectShouldThrow = false;
const upserts: InstalledRow[] = [];
let deletes = 0;
mock.module("@SunReye/db", () => ({
  db: {
    select: () => ({
      from: () => {
        if (selectShouldThrow) throw new Error("db is down");
        return Promise.resolve(installedRows);
      },
    }),
    insert: () => ({
      values: (row: InstalledRow) => ({
        onConflictDoUpdate: async () => {
          upserts.push(row);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        deletes++;
      },
    }),
  },
}));

const {
  browseAvailable,
  dropLegacyDefaultSource,
  getProfileSources,
  getUpdateCheck,
  installProfile,
  listInstalled,
  setActiveProfile,
  setProfileSources,
  startUpdateChecks,
  stopUpdateChecks,
  uninstallProfile,
} = await import("./profiles");

// --- local git fixture -------------------------------------------------------

const profileJson = (id: string, name: string) =>
  JSON.stringify(
    defineProfile({
      id,
      name,
      manufacturer: "ACME",
      version: "1.0.0",
      metrics: [
        metric("battery/soc", {
          label: "SOC",
          unit: "%",
          group: "battery",
          addr: 100,
          role: "battery.soc",
        }),
      ],
    }),
  );

const indexJson = JSON.stringify({
  name: "Test Repo",
  maintainer: "tester",
  profiles: [
    // Deliberately index-ordered so the natural sort is observable ("SUN-5K"
    // must precede "SUN-10K" despite lexicographic order).
    {
      id: "acme-sun10k",
      name: "SUN-10K",
      manufacturer: "ACME",
      version: "1.0.0",
      path: "profiles/acme-sun10k.json",
    },
    {
      id: "acme-sun5k",
      name: "SUN-5K",
      manufacturer: "ACME",
      version: "1.0.0",
      path: "profiles/acme-sun5k.json",
    },
    // Index/file identity mismatch — install must refuse.
    {
      id: "acme-mismatch",
      name: "Mismatch",
      manufacturer: "ACME",
      version: "1.0.0",
      path: "profiles/acme-sun5k.json",
    },
  ],
});

let originDir: string;
let originUrl: string;
let missingUrl: string;

beforeAll(async () => {
  originDir = await mkdtemp(join(tmpdir(), "sunreye-profiles-origin-"));
  await Bun.spawn(["git", "init", "-b", "main"], { cwd: originDir }).exited;
  await mkdir(join(originDir, "profiles"), { recursive: true });
  await writeFile(join(originDir, "index.json"), indexJson);
  await writeFile(
    join(originDir, "profiles", "acme-sun10k.json"),
    profileJson("acme-sun10k", "SUN-10K"),
  );
  await writeFile(
    join(originDir, "profiles", "acme-sun5k.json"),
    profileJson("acme-sun5k", "SUN-5K"),
  );
  await Bun.spawn(["git", "add", "-A"], { cwd: originDir }).exited;
  await Bun.spawn(["git", "commit", "-m", "initial"], {
    cwd: originDir,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  }).exited;
  originUrl = `file://${originDir}`;
  missingUrl = `file://${originDir}-does-not-exist`;
});

afterAll(async () => {
  stopUpdateChecks();
  await rm(originDir, { recursive: true, force: true });
});

/** Point the (mocked) sources at the fixture; official stays but disabled. */
const useFixtureSources = () => {
  rawKeys.add(PROFILE_SOURCES_KEY);
  store.set(PROFILE_SOURCES_KEY, {
    sources: [
      { url: OFFICIAL_SOURCE_URL, enabled: false }, // never synced in tests
      { url: originUrl, enabled: true },
    ],
  });
};

describe("profile sources", () => {
  test("the protected official source is merged into an empty config", async () => {
    store.delete(PROFILE_SOURCES_KEY);
    const { sources } = await getProfileSources();
    expect(sources).toEqual([
      { url: OFFICIAL_SOURCE_URL, label: "SunReye Official Profiles", enabled: true },
    ]);
  });

  test("a write dropping the official source gets it re-injected", async () => {
    const result = await setProfileSources({
      sources: [{ url: "https://example.com/custom-profiles.git" }],
    });
    expect(result.sources.map((s) => s.url)).toEqual([
      OFFICIAL_SOURCE_URL,
      "https://example.com/custom-profiles.git",
    ]);
    expect(store.get(PROFILE_SOURCES_KEY)).toEqual(result);
  });

  test("a disabled official entry is preserved, not duplicated", async () => {
    const result = await setProfileSources({
      sources: [{ url: OFFICIAL_SOURCE_URL, enabled: false }],
    });
    expect(result.sources).toEqual([{ url: OFFICIAL_SOURCE_URL, enabled: false }]);
  });

  test("rejects non-https source URLs", () => {
    expect(
      setProfileSources({ sources: [{ url: "ssh://git@example.com/x.git" }] }),
    ).rejects.toThrow();
  });
});

describe("dropLegacyDefaultSource", () => {
  test("removes the stale legacy seed once, then no-ops", async () => {
    store.set(PROFILE_SOURCES_KEY, {
      sources: [{ url: LEGACY_DEFAULT_SOURCE_URL, enabled: true }],
    });
    await dropLegacyDefaultSource();
    const after = store.get(PROFILE_SOURCES_KEY) as { sources: Array<{ url: string }> };
    expect(after.sources.map((s) => s.url)).toEqual([OFFICIAL_SOURCE_URL]);

    // Second run: nothing legacy left → early return, no rewrite.
    store.delete(PROFILE_SOURCES_KEY);
    await dropLegacyDefaultSource();
    expect(store.has(PROFILE_SOURCES_KEY)).toBe(false);
  });
});

describe("setActiveProfile", () => {
  test("persists a valid id and rejects an empty one", async () => {
    await expect(setActiveProfile({ id: "acme-sun5k" })).resolves.toEqual({ id: "acme-sun5k" });
    expect(store.get(ACTIVE_PROFILE_KEY)).toEqual({ id: "acme-sun5k" });
    expect(setActiveProfile({ id: "" })).rejects.toThrow();
  });
});

describe("listInstalled", () => {
  test("summarizes rows from the stored blob", async () => {
    const installedAt = new Date("2026-07-01T10:00:00Z");
    installedRows = [
      {
        id: "acme-sun5k",
        data: JSON.parse(profileJson("acme-sun5k", "SUN-5K")),
        version: "0.9.0",
        source: originUrl,
        installedAt,
      },
    ];
    await expect(listInstalled()).resolves.toEqual([
      {
        id: "acme-sun5k",
        name: "SUN-5K",
        manufacturer: "ACME",
        version: "0.9.0",
        source: originUrl,
        installedAt: installedAt.toISOString(),
      },
    ]);
  });
});

describe("browseAvailable", () => {
  test("annotates repo entries against the installed set; bad sources go to errors", async () => {
    rawKeys.add(PROFILE_SOURCES_KEY);
    store.set(PROFILE_SOURCES_KEY, {
      sources: [
        { url: OFFICIAL_SOURCE_URL, enabled: false }, // disabled → skipped
        { url: originUrl, enabled: true },
        { url: missingUrl, enabled: true }, // sync fails → reported, not fatal
      ],
    });
    // acme-sun5k installed at 0.9.0 (from the previous test) → update available.
    const { profiles, errors } = await browseAvailable();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe(missingUrl);

    // Natural sort: SUN-5K before SUN-10K.
    expect(profiles.map((p) => p.name)).toEqual(["Mismatch", "SUN-5K", "SUN-10K"]);
    const sun5k = profiles.find((p) => p.id === "acme-sun5k")!;
    expect(sun5k).toMatchObject({
      source: originUrl,
      installed: true,
      installedVersion: "0.9.0",
      updateAvailable: true,
    });
    const sun10k = profiles.find((p) => p.id === "acme-sun10k")!;
    expect(sun10k).toMatchObject({ installed: false, updateAvailable: false });
  });
});

describe("installProfile", () => {
  test("downloads, validates, persists, and registers the profile", async () => {
    useFixtureSources();
    const result = await installProfile(originUrl, "acme-sun5k");
    expect(result).toEqual({ id: "acme-sun5k", version: "1.0.0" });
    expect(upserts[0]).toMatchObject({ id: "acme-sun5k", source: originUrl, version: "1.0.0" });
    expect(tryGetProfile("acme-sun5k")?.name).toBe("SUN-5K");
  });

  test("rejects an id the index does not list", () => {
    expect(installProfile(originUrl, "ghost")).rejects.toThrow(/not found in/);
  });

  test("rejects an index/file identity mismatch", () => {
    expect(installProfile(originUrl, "acme-mismatch")).rejects.toThrow(/id mismatch/);
  });
});

describe("uninstallProfile", () => {
  test("deletes the row and drops the runtime registration", async () => {
    expect(tryGetProfile("acme-sun5k")).toBeDefined();
    await uninstallProfile("acme-sun5k");
    expect(deletes).toBe(1);
    expect(tryGetProfile("acme-sun5k")).toBeUndefined();
  });
});

describe("update checker", () => {
  test("background check diffs installed versions against the sources", async () => {
    useFixtureSources();
    installedRows = [
      {
        id: "acme-sun5k",
        data: JSON.parse(profileJson("acme-sun5k", "SUN-5K")),
        version: "0.9.0",
        source: originUrl,
        installedAt: new Date(),
      },
    ];

    // Capture the scheduled run (15 s initial delay / 6 h interval are far
    // beyond the test's lifetime) while passing through to real timers.
    const realSetTimeout = globalThis.setTimeout;
    const scheduled: Array<() => void> = [];
    const timeoutSpy = spyOn(globalThis, "setTimeout");
    timeoutSpy.mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms === 15_000) {
        scheduled.push(fn);
        return realSetTimeout(() => {}, 0); // don't keep a 15 s timer alive
      }
      return realSetTimeout(fn, ms, ...args);
    }) as typeof setTimeout);

    try {
      expect(getUpdateCheck()).toEqual({ checkedAt: null, updates: [], errors: [] });
      startUpdateChecks();
      startUpdateChecks(); // second call is a no-op (timer already armed)
      expect(scheduled).toHaveLength(1);

      scheduled[0]!();
      // The run is async; poll the cached result until it lands.
      const deadline = Date.now() + 5000;
      while (getUpdateCheck().checkedAt === null && Date.now() < deadline) {
        await Bun.sleep(10);
      }
      const result = getUpdateCheck();
      expect(result.checkedAt).not.toBeNull();
      expect(result.updates).toEqual([
        {
          id: "acme-sun5k",
          name: "SUN-5K",
          manufacturer: "ACME",
          source: originUrl,
          installedVersion: "0.9.0",
          latestVersion: "1.0.0",
        },
      ]);

      // A crashing check is caught + logged, never unhandled.
      selectShouldThrow = true;
      scheduled[0]!();
      await Bun.sleep(20);
      selectShouldThrow = false;
    } finally {
      timeoutSpy.mockRestore();
      stopUpdateChecks();
      stopUpdateChecks(); // idempotent
    }
  });
});
