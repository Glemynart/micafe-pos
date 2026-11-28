const OPERATOR_CODE_STORAGE_KEY = "pos_operator_user";
const OPERATOR_CODE_REMEMBERED_KEY = "pos_operator_user_remembered";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StoragePort | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Reads only the operator code. PINs are never persisted. */
export function readRememberedOperatorCode(storage = browserStorage()): string {
  if (!storage) return "";
  try {
    if (storage.getItem(OPERATOR_CODE_REMEMBERED_KEY) !== "1") {
      // Remove codes saved by the previous default-on checkbox. Remembering is now opt-in.
      storage.removeItem(OPERATOR_CODE_STORAGE_KEY);
      storage.removeItem(OPERATOR_CODE_REMEMBERED_KEY);
      return "";
    }
    return storage.getItem(OPERATOR_CODE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Stores the code only when requested and removes any saved code when disabled. */
export function persistOperatorCode(
  code: string,
  remember: boolean,
  storage = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (!remember) {
      storage.removeItem(OPERATOR_CODE_STORAGE_KEY);
      storage.removeItem(OPERATOR_CODE_REMEMBERED_KEY);
      return;
    }

    const normalized = code.trim();
    if (normalized) {
      storage.setItem(OPERATOR_CODE_STORAGE_KEY, normalized);
      storage.setItem(OPERATOR_CODE_REMEMBERED_KEY, "1");
    }
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}
