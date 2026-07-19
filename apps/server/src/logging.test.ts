import { describe, expect, test } from "bun:test";
import { log, setupLogging } from "./logging";

describe("setupLogging", () => {
  test("configures LogTape and is idempotent (second call is a no-op)", async () => {
    await setupLogging();
    // A second call must return early instead of re-running configure(), which
    // would throw ("already configured") without the guard.
    await expect(setupLogging()).resolves.toBeUndefined();
  });
});

describe("log", () => {
  test("nests subcategories under the shared server root", () => {
    expect(log("mqtt").category).toEqual(["server", "mqtt"]);
    expect(log("api", "status").category).toEqual(["server", "api", "status"]);
  });

  test("returns a usable logger", () => {
    const logger = log("test-suite");
    expect(typeof logger.debug).toBe("function");
    // Must not throw once setupLogging has wired the sinks.
    logger.debug("logging smoke test");
  });
});
