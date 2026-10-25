import assert from "node:assert/strict";
import test from "node:test";
import { persistAdminUsername, readRememberedAdminUsername } from "./admin-username-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    value: (key: string) => values.get(key) ?? null,
  };
}

test("reads the remembered login code without storing a PIN", () => {
  const storage = memoryStorage({ admin_user: "diana-admin" });

  assert.equal(readRememberedAdminUsername(storage), "diana-admin");
  assert.equal(storage.value("admin_pin"), null);
});

test("remembers the trimmed code when the user opts in", () => {
  const storage = memoryStorage();

  persistAdminUsername("  diana-admin  ", true, storage);

  assert.equal(storage.value("admin_user"), "diana-admin");
});

test("clears a previously remembered code when the user opts out", () => {
  const storage = memoryStorage({ admin_user: "old-code" });

  persistAdminUsername("new-code", false, storage);

  assert.equal(storage.value("admin_user"), null);
});

test("does not replace a remembered code with blank input", () => {
  const storage = memoryStorage({ admin_user: "existing-code" });

  persistAdminUsername("   ", true, storage);

  assert.equal(storage.value("admin_user"), "existing-code");
});

test("storage failures do not break the login page", () => {
  const storage = {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { throw new Error("storage unavailable"); },
    removeItem: () => { throw new Error("storage unavailable"); },
  };

  assert.equal(readRememberedAdminUsername(storage), "");
  assert.doesNotThrow(() => persistAdminUsername("diana-admin", true, storage));
  assert.doesNotThrow(() => persistAdminUsername("diana-admin", false, storage));
});
