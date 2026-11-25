import assert from "node:assert/strict";
import test from "node:test";
import { persistOperatorCode, readRememberedOperatorCode } from "./operator-code-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    value: (key: string) => values.get(key) ?? null,
  };
}

test("reads the remembered operator code without storing a PIN", () => {
  const storage = memoryStorage({ pos_operator_user: "caja-01", pos_operator_user_remembered: "1" });

  assert.equal(readRememberedOperatorCode(storage), "caja-01");
  assert.equal(storage.value("pos_operator_pin"), null);
});

test("remembers the trimmed operator code when enabled", () => {
  const storage = memoryStorage();

  persistOperatorCode("  caja-01  ", true, storage);

  assert.equal(storage.value("pos_operator_user"), "caja-01");
  assert.equal(storage.value("pos_operator_user_remembered"), "1");
});

test("clears legacy codes that were stored before explicit opt-in", () => {
  const storage = memoryStorage({ pos_operator_user: "legacy-code" });

  assert.equal(readRememberedOperatorCode(storage), "");
  assert.equal(storage.value("pos_operator_user"), null);
});

test("clears the saved operator code when remembering is disabled", () => {
  const storage = memoryStorage({ pos_operator_user: "old-code", pos_operator_user_remembered: "1" });

  persistOperatorCode("new-code", false, storage);

  assert.equal(storage.value("pos_operator_user"), null);
  assert.equal(storage.value("pos_operator_user_remembered"), null);
});

test("does not replace a remembered code with blank input", () => {
  const storage = memoryStorage({ pos_operator_user: "existing-code", pos_operator_user_remembered: "1" });

  persistOperatorCode("   ", true, storage);

  assert.equal(storage.value("pos_operator_user"), "existing-code");
});

test("storage failures do not break the login page", () => {
  const storage = {
    getItem: () => { throw new Error("storage unavailable"); },
    setItem: () => { throw new Error("storage unavailable"); },
    removeItem: () => { throw new Error("storage unavailable"); },
  };

  assert.equal(readRememberedOperatorCode(storage), "");
  assert.doesNotThrow(() => persistOperatorCode("caja-01", true, storage));
  assert.doesNotThrow(() => persistOperatorCode("caja-01", false, storage));
});
