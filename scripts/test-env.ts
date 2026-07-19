// bun test preload (root bunfig.toml). packages/env validates required server
// vars at import time; tests run from the repo root where no .env exists, so
// give the required vars harmless defaults. Real values (from a shell or an
// apps/server/.env already loaded) always win via ??=.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret!";
process.env.NODE_ENV ??= "test";
