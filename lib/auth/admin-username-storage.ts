const ADMIN_USERNAME_STORAGE_KEY = "admin_user";
const ADMIN_USERNAME_REMEMBERED_KEY = "admin_user_remembered";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StoragePort | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Reads only the operational login code; PINs are never persisted. */
export function readRememberedAdminUsername(storage = browserStorage()): string {
  if (!storage) return "";
  try {
    if (storage.getItem(ADMIN_USERNAME_REMEMBERED_KEY) !== "1") {
      // Remove codes saved by the previous default-on checkbox. Remembering is now opt-in.
      storage.removeItem(ADMIN_USERNAME_STORAGE_KEY);
      storage.removeItem(ADMIN_USERNAME_REMEMBERED_KEY);
      return "";
    }
    return storage.getItem(ADMIN_USERNAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Stores the code only when requested and removes any old value when disabled. */
export function persistAdminUsername(
  username: string,
  remember: boolean,
  storage = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (!remember) {
      storage.removeItem(ADMIN_USERNAME_STORAGE_KEY);
      storage.removeItem(ADMIN_USERNAME_REMEMBERED_KEY);
      return;
    }

    const normalized = username.trim();
    if (normalized) {
      storage.setItem(ADMIN_USERNAME_STORAGE_KEY, normalized);
      storage.setItem(ADMIN_USERNAME_REMEMBERED_KEY, "1");
    }
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}
