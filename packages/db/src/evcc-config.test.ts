import { describe, expect, test } from "bun:test";

import { defaultEvcc, evccConfigSchema, evccReady } from "./evcc-config";

describe("evcc config", () => {
  test("defaults to disabled with the stock topic root", () => {
    expect(defaultEvcc.enabled).toBe(false);
    expect(defaultEvcc.topicRoot).toBe("evcc");
    expect(defaultEvcc.subtractFromHome).toBe(false);
  });

  test("rejects an empty or oversized topic root", () => {
    expect(evccConfigSchema.safeParse({ topicRoot: "" }).success).toBe(false);
    expect(evccConfigSchema.safeParse({ topicRoot: "x".repeat(121) }).success).toBe(false);
    expect(evccConfigSchema.safeParse({ topicRoot: "home/evcc" }).success).toBe(true);
  });

  test("evccReady requires enabled + a non-blank broker url", () => {
    const on = { ...defaultEvcc, enabled: true };
    expect(evccReady(defaultEvcc, { brokerUrl: "mqtt://broker:1883" })).toBe(false); // disabled
    expect(evccReady(on, { brokerUrl: "" })).toBe(false);
    expect(evccReady(on, { brokerUrl: "   " })).toBe(false); // whitespace-only broker
    expect(evccReady(on, { brokerUrl: "mqtt://broker:1883" })).toBe(true);
  });
});
