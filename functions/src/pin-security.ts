import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

function materialPin(pin: string, pepper: string): string {
  return `${pin}:${pepper}`;
}

export async function hashearPin(pin: string, pepper: string): Promise<string> {
  return bcrypt.hash(materialPin(pin, pepper), BCRYPT_COST);
}

export async function verificarPin(pin: string, hash: string, pepper: string): Promise<boolean> {
  return bcrypt.compare(materialPin(pin, pepper), hash);
}
