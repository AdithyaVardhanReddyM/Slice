#!/bin/sh
# Vercel's Ignored Build Step for the one-store projects (STORE=<slug>, see
# vercel.json): exit 0 skips the build, exit 1 builds. A push builds a store only
# when something it ships changed since its last deployment; other stores' files,
# the store index (the root redirects to the store) and the rest of the monorepo
# don't count. When in doubt, build.
[ -n "$STORE" ] && [ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1
git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null || exit 1

set -- ":(exclude)src/app/page.tsx"
for dir in src/app/*/; do
  store=$(basename "$dir")
  [ "$store" = "$STORE" ] && continue
  set -- "$@" ":(exclude)src/app/$store" ":(exclude)src/components/$store" ":(exclude)src/lib/$store" ":(exclude)src/lib/$store.ts" ":(exclude)public/$store"
done

if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../../packages/demo-catalogs ../../package.json ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../turbo.json "$@"; then
  echo "Nothing $STORE ships changed since $VERCEL_GIT_PREVIOUS_SHA; skipping the build."
  exit 0
fi
exit 1
