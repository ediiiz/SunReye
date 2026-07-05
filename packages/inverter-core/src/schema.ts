import { z } from "zod";

import { ROLE_CATALOG, ROLE_NAMES, type RoleSpec } from "./roles";
import type { ComputeExpr, ProfileData } from "./profile-data";

/**
 * Strict runtime validator for {@link ProfileData}. This is the single gate for
 * every ingested profile — the SDK at author time, the install path at download
 * time, and the server at boot load. Because a profile is pure data, the whole
 * threat surface is malformed data, and it is contained here: a bad profile
 * fails validation or yields nothing — it can never execute code.
 *
 * Beyond structural checks it runs semantic lints a plain schema can't express
 * (duplicate keys/addresses, register-width mismatches, role-shape rules from
 * {@link ROLE_CATALOG}, and forward references in `computeExpr`).
 */

const registerTypeSchema = z.enum(["U_WORD", "S_WORD", "U_DWORD", "RAW"]);

const computeExprSchema = z.union([
  z.strictObject({ sum: z.array(z.string().min(1)).min(1) }),
  z.strictObject({ diff: z.tuple([z.string().min(1), z.string().min(1)]) }),
  z.strictObject({ scale: z.tuple([z.string().min(1), z.number()]) }),
]);

const metricDataSchema = z.strictObject({
  key: z.string().min(1),
  topic: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().nullable(),
  group: z.string().min(1),
  type: registerTypeSchema,
  addresses: z.array(z.number().int().min(0).max(65535)),
  scale: z.number(),
  access: z.enum(["r", "rw"]),
  computeExpr: computeExprSchema.optional(),
  role: z.enum(ROLE_NAMES).optional(),
  index: z.number().int().positive().optional(),
  kind: z.enum(["measurement", "cumulative", "status", "setting"]).optional(),
  range: z.strictObject({ min: z.number(), max: z.number() }).optional(),
  // JSON object keys are strings; enum keys must be integer-like.
  enumLabels: z.record(z.string().regex(/^-?\d+$/), z.string()).optional(),
  flow: z.strictObject({ positive: z.string(), negative: z.string() }).optional(),
});

function computeRefs(expr: ComputeExpr): string[] {
  if ("sum" in expr) return expr.sum;
  if ("diff" in expr) return expr.diff;
  return [expr.scale[0]];
}

export const profileDataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be a lowercase slug"),
    name: z.string().min(1),
    manufacturer: z.string().min(1),
    version: z.string().min(1),
    metrics: z.array(metricDataSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const { metrics } = data;
    const at = (i: number, field: string, message: string) =>
      ctx.addIssue({ code: "custom", path: ["metrics", i, field], message });

    // --- duplicate keys ---
    const seenKey = new Set<string>();
    metrics.forEach((m, i) => {
      if (seenKey.has(m.key)) at(i, "key", `duplicate metric key "${m.key}"`);
      seenKey.add(m.key);
    });

    // --- duplicate wire addresses (computed metrics carry none) ---
    const owner = new Map<number, string>();
    metrics.forEach((m, i) => {
      if (m.computeExpr) return;
      for (const a of m.addresses) {
        const prev = owner.get(a);
        if (prev !== undefined) at(i, "addresses", `address ${a} already used by "${prev}"`);
        else owner.set(a, m.key);
      }
    });

    // --- register width matches type ---
    metrics.forEach((m, i) => {
      if (m.computeExpr) {
        if (m.addresses.length !== 0) at(i, "addresses", "computed metric must have no addresses");
        return;
      }
      if (m.type === "RAW") {
        if (m.addresses.length < 1) at(i, "addresses", "RAW metric needs at least one address");
        return;
      }
      const want = m.type === "U_DWORD" ? 2 : 1;
      if (m.addresses.length !== want) {
        at(i, "addresses", `${m.type} needs ${want} address(es), got ${m.addresses.length}`);
      }
    });

    // --- role-shape rules from the catalog ---
    metrics.forEach((m, i) => {
      if (!m.role) return;
      const spec: RoleSpec = ROLE_CATALOG[m.role];
      if (spec.indexed && m.index === undefined) {
        at(i, "index", `role "${m.role}" is indexed and requires a 1-based index`);
      }
      if (spec.needsEnumLabels && (!m.enumLabels || Object.keys(m.enumLabels).length === 0)) {
        at(i, "enumLabels", `role "${m.role}" requires enumLabels`);
      }
      if (spec.writable && m.access !== "rw") {
        at(i, "access", `role "${m.role}" is a control and requires access "rw"`);
      }
    });

    // --- computeExpr references must resolve, and never forward-ref a computed metric ---
    const posByKey = new Map(metrics.map((m, i) => [m.key, i] as const));
    const computed = new Set(metrics.filter((m) => m.computeExpr).map((m) => m.key));
    metrics.forEach((m, i) => {
      if (!m.computeExpr) return;
      for (const ref of computeRefs(m.computeExpr)) {
        const pos = posByKey.get(ref);
        if (pos === undefined) {
          at(i, "computeExpr", `references unknown metric key "${ref}"`);
        } else if (computed.has(ref) && pos >= i) {
          at(i, "computeExpr", `references computed metric "${ref}" not defined earlier`);
        }
      }
    });
  });

/** Validate untrusted input and return typed {@link ProfileData} (throws on failure). */
export function parseProfileData(input: unknown): ProfileData {
  return profileDataSchema.parse(input) as ProfileData;
}

/** Non-throwing variant for UI/CLI paths that want to render the issues. */
export function safeParseProfileData(input: unknown) {
  return profileDataSchema.safeParse(input);
}
