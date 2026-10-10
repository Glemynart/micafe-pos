import assert from "node:assert/strict";
import test from "node:test";
import { copyCredentialWithFeedback, copyTextToClipboard } from "../../lib/clipboard";

function legacyDocument(copied: boolean) {
  let appendedValue = "";
  let removed = false;
  const textarea = {
    value: "",
    tabIndex: 0,
    style: {} as Record<string, string>,
    setAttribute() {},
    select() {},
    setSelectionRange() {},
    remove() { removed = true; },
  };
  const document = {
    body: {
      appendChild(element: typeof textarea) {
        appendedValue = element.value;
      },
    },
    createElement() { return textarea; },
    execCommand(command: string) {
      assert.equal(command, "copy");
      return copied;
    },
  };

  return {
    document: document as unknown as Document,
    appendedValue: () => appendedValue,
    wasRemoved: () => removed,
  };
}

test("reports success only after the browser clipboard accepts the exact credential", async () => {
  const copied: string[] = [];

  const result = await copyTextToClipboard("codigo-temporal", {
    clipboard: { writeText: async value => { copied.push(value); } },
  });

  assert.equal(result, true);
  assert.deepEqual(copied, ["codigo-temporal"]);
});

test("falls back to a selected temporary field when Clipboard API rejects and cleans it up", async () => {
  const fallback = legacyDocument(true);

  const result = await copyTextToClipboard("pin-ejemplo-no-valido", {
    clipboard: { writeText: async () => { throw new Error("permission denied"); } },
    document: fallback.document,
  });

  assert.equal(result, true);
  assert.equal(fallback.appendedValue(), "pin-ejemplo-no-valido");
  assert.equal(fallback.wasRemoved(), true);
});

test("reports failure when neither clipboard mechanism can copy", async () => {
  const fallback = legacyDocument(false);

  const result = await copyTextToClipboard("pin-ejemplo-no-valido", {
    clipboard: { writeText: async () => { throw new Error("permission denied"); } },
    document: fallback.document,
  });

  assert.equal(result, false);
  assert.equal(fallback.wasRemoved(), true);
});

test("does not claim to copy empty credentials", async () => {
  let attempted = false;

  const result = await copyTextToClipboard("", {
    clipboard: { writeText: async () => { attempted = true; } },
  });

  assert.equal(result, false);
  assert.equal(attempted, false);
});

test("shows success feedback only after copy succeeds", async () => {
  const messages: string[] = [];

  const result = await copyCredentialWithFeedback("codigo-ejemplo", "Código", {
    success: message => { messages.push(`success:${message}`); },
    error: message => { messages.push(`error:${message}`); },
  }, {
    clipboard: { writeText: async () => {} },
  });

  assert.equal(result, true);
  assert.deepEqual(messages, ["success:Código copiado"]);
});

test("reports a manual recovery path when clipboard access and fallback fail", async () => {
  const messages: string[] = [];
  const fallback = legacyDocument(false);

  const result = await copyCredentialWithFeedback("pin-ejemplo-no-valido", "PIN temporal", {
    success: message => { messages.push(`success:${message}`); },
    error: message => { messages.push(`error:${message}`); },
  }, {
    clipboard: { writeText: async () => { throw new Error("permission denied"); } },
    document: fallback.document,
  });

  assert.equal(result, false);
  assert.deepEqual(messages, ["error:No se pudo copiar el pin temporal. Selecciona el valor y usa Ctrl+C."]);
});
