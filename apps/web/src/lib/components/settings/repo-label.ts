import type { Source } from "./profile-types";

// Human-friendly name for the repo a profile came from. Prefer the label the
// user set on the matching source; otherwise derive `org/repo` from the git URL
// (dropping the host and the trailing ".git"). Falls back to the raw url.
export function repoLabel(url: string, sources: Source[]): string {
  const source = sources.find((s) => s.url === url);
  if (source?.label) return source.label;
  const cleaned = url.replace(/\.git$/, "").replace(/\/+$/, "");
  const path = cleaned.replace(/^https?:\/\/[^/]+\//, "");
  return path || cleaned;
}
