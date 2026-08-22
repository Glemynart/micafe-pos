import { createHash, timingSafeEqual } from "node:crypto";

export function firmaIntegridadCheckout(reference: string, amountInCents: number, currency: string, secret: string) {
  return createHash("sha256").update(`${reference}${amountInCents}${currency}${secret}`, "utf8").digest("hex");
}

export function compararHexSeguro(actual: unknown, esperado: string) {
  if (typeof actual !== "string" || !/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(esperado)) return false;
  return timingSafeEqual(Buffer.from(actual.toLowerCase(), "hex"), Buffer.from(esperado.toLowerCase(), "hex"));
}
