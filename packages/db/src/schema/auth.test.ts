import { describe, expect, test } from "bun:test";

import { createTableRelationsHelpers } from "drizzle-orm";
import { getTableConfig, type PgTableWithColumns } from "drizzle-orm/pg-core";

import {
  account,
  accountRelations,
  apikey,
  apikeyRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth";

// Pure schema-shape tests: the runtime code in this module is all lazy
// callbacks — `$onUpdate` on the updated_at columns, the `references(() =>
// user.id)` arrows, and the `relations()` config functions — so invoke each
// directly. No database involved.

/** Invoke a column's `$onUpdate` callback and assert it yields "now". */
function expectOnUpdateNow(column: unknown): void {
  const onUpdateFn = (column as { onUpdateFn?: () => unknown }).onUpdateFn;
  expect(typeof onUpdateFn).toBe("function");
  const before = Date.now();
  const value = onUpdateFn!();
  expect(value).toBeInstanceOf(Date);
  expect((value as Date).getTime()).toBeGreaterThanOrEqual(before);
  expect((value as Date).getTime()).toBeLessThanOrEqual(Date.now());
}

/** Resolve a table's single FK and assert it points at `user.id`. */
// oxlint-disable-next-line no-explicit-any -- table generic is irrelevant here
function expectFkOnUserId(table: PgTableWithColumns<any>, columnName: string): void {
  const { foreignKeys } = getTableConfig(table);
  expect(foreignKeys).toHaveLength(1);
  const ref = foreignKeys[0]!.reference(); // invokes the `() => user.id` arrow
  expect(ref.columns.map((c) => c.name)).toEqual([columnName]);
  expect(ref.foreignColumns.map((c) => c.name)).toEqual(["id"]);
}

describe("auth schema", () => {
  test("updated_at refreshes via $onUpdate on every auth table", () => {
    expectOnUpdateNow(user.updatedAt);
    expectOnUpdateNow(session.updatedAt);
    expectOnUpdateNow(account.updatedAt);
    expectOnUpdateNow(verification.updatedAt);
    expectOnUpdateNow(apikey.updatedAt);
  });

  test("session/account/apikey cascade-delete against user.id", () => {
    expectFkOnUserId(session, "user_id");
    expectFkOnUserId(account, "user_id");
    expectFkOnUserId(apikey, "reference_id");
  });
});

describe("auth relations", () => {
  test("user has many sessions, accounts, and apikeys", () => {
    const rels = userRelations.config(createTableRelationsHelpers(user));
    expect(Object.keys(rels).sort()).toEqual(["accounts", "apikeys", "sessions"]);
    expect(rels.sessions.referencedTableName).toBe("session");
    expect(rels.accounts.referencedTableName).toBe("account");
    expect(rels.apikeys.referencedTableName).toBe("apikey");
  });

  test("session, account, and apikey each belong to one user", () => {
    const one = (rels: ReturnType<typeof sessionRelations.config>) => rels.user.config!;

    const s = one(sessionRelations.config(createTableRelationsHelpers(session)));
    expect(s.fields.map((c) => c.name)).toEqual(["user_id"]);
    expect(s.references.map((c) => c.name)).toEqual(["id"]);

    const a = one(accountRelations.config(createTableRelationsHelpers(account)));
    expect(a.fields.map((c) => c.name)).toEqual(["user_id"]);

    const k = one(apikeyRelations.config(createTableRelationsHelpers(apikey)));
    expect(k.fields.map((c) => c.name)).toEqual(["reference_id"]);
    expect(k.references.map((c) => c.name)).toEqual(["id"]);
  });
});
