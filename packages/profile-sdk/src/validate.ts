import { safeParseProfileData } from "@SunReye/inverter-core";

export interface ValidationResult {
  ok: boolean;
  /** Human-readable `path: message` lines, empty when valid. */
  issues: string[];
}

/** Run the strict profile validator and flatten its issues for display. */
export function validateProfile(input: unknown): ValidationResult {
  const result = safeParseProfileData(input);
  if (result.success) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
