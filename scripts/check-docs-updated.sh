#!/usr/bin/env sh
#
# Pre-commit check: if a commit changes source code but touches no documentation,
# remind the author to review whether the docs need updating.
#
# This is a *reminder*, not a gate — it exits 0 by default so it never blocks a
# commit. Set DOCS_CHECK_STRICT=1 to make it fail instead (useful in CI), and
# bypass any single commit with `git commit --no-verify`.

set -eu

# Files staged for this commit (added / copied / modified / renamed).
staged="$(git diff --cached --name-only --diff-filter=ACMR)"

[ -z "$staged" ] && exit 0

# Source code that plausibly affects documented behaviour.
code_pattern='^(apps/server|apps/web|packages)/.*\.(ts|tsx|js|jsx|mjs|cjs|astro|svelte|sql)$'

# Anything we consider documentation.
docs_pattern='(^apps/docs/src/content/|(^|/)README\.md$|\.(md|mdx)$)'

code_changes="$(printf '%s\n' "$staged" | grep -E "$code_pattern" || true)"
docs_changes="$(printf '%s\n' "$staged" | grep -E "$docs_pattern" || true)"

# No relevant code changes, or docs were already touched -> nothing to warn about.
if [ -z "$code_changes" ] || [ -n "$docs_changes" ]; then
  exit 0
fi

printf '\n\033[33m⚠  Docs check: code changed but no documentation was updated.\033[0m\n\n'
printf 'Staged code changes:\n'
printf '%s\n' "$code_changes" | sed 's/^/  • /'
printf '\nIf this change affects documented behaviour, please update the docs in\n'
printf '  apps/docs/src/content/  (or the relevant README).\n'
printf 'To skip this check for one commit: \033[36mgit commit --no-verify\033[0m\n\n'

if [ "${DOCS_CHECK_STRICT:-0}" = "1" ]; then
  printf '\033[31mDOCS_CHECK_STRICT=1 set — failing commit.\033[0m\n\n'
  exit 1
fi

exit 0
