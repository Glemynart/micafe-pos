export type ClipboardEnvironment = {
  clipboard?: Pick<Clipboard, "writeText"> | null;
  document?: Pick<Document, "body" | "createElement" | "execCommand"> | null;
};

export type ClipboardFeedback = {
  success(message: string): unknown;
  error(message: string): unknown;
};

function browserClipboard(): Pick<Clipboard, "writeText"> | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}

function browserDocument(): Pick<Document, "body" | "createElement" | "execCommand"> | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function copyWithTemporaryField(text: string, documentRef: ClipboardEnvironment["document"]): boolean {
  if (!documentRef?.body) return false;

  let field: HTMLTextAreaElement | undefined;
  try {
    field = documentRef.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    field.tabIndex = -1;
    field.style.position = "fixed";
    field.style.left = "-9999px";
    field.style.top = "0";
    field.style.opacity = "0";
    documentRef.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, field.value.length);
    return documentRef.execCommand("copy");
  } catch {
    return false;
  } finally {
    field?.remove();
  }
}

/** Copies text only when the browser confirms success, with a legacy fallback. */
export async function copyTextToClipboard(
  text: string,
  environment: ClipboardEnvironment = {},
): Promise<boolean> {
  if (!text) return false;

  const clipboard = environment.clipboard === undefined ? browserClipboard() : environment.clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Some browser profiles deny Clipboard API access; try the user-gesture fallback.
    }
  }

  const documentRef = environment.document === undefined ? browserDocument() : environment.document;
  return copyWithTemporaryField(text, documentRef);
}

/** Keeps credential-copy feedback truthful and gives a manual recovery path. */
export async function copyCredentialWithFeedback(
  value: string | undefined,
  label: string,
  feedback: ClipboardFeedback,
  environment?: ClipboardEnvironment,
): Promise<boolean> {
  if (!value) {
    feedback.error(`No hay ${label.toLowerCase()} para copiar.`);
    return false;
  }

  const copied = await copyTextToClipboard(value, environment);
  if (copied) {
    feedback.success(`${label} copiado`);
  } else {
    feedback.error(`No se pudo copiar el ${label.toLowerCase()}. Selecciona el valor y usa Ctrl+C.`);
  }
  return copied;
}
