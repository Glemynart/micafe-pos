/** Utilidades deterministas; no modifican el documento recibido. */
export function normalizarTexto(valor: string): string {
  return valor.normalize("NFC").trim();
}

export function esTextoCanonico(valor: unknown, minimo = 1, maximo = 240): valor is string {
  return typeof valor === "string"
    && valor === normalizarTexto(valor)
    && valor.length >= minimo
    && valor.length <= maximo
    && !/[\u0000-\u001F\u007F]/.test(valor);
}

export function esEmailCanonico(valor: unknown): boolean {
  return esTextoCanonico(valor, 3, 254)
    && valor === valor.toLowerCase()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function esTelefonoCanonico(valor: unknown): boolean {
  return esTextoCanonico(valor, 7, 20) && /^\+[1-9]\d{6,14}$/.test(valor);
}

export function esColorHexCanonico(valor: unknown): valor is string {
  return typeof valor === "string" && /^#[0-9A-F]{6}$/.test(valor);
}

function luminancia(hex: string): number {
  const valores = [1, 3, 5].map((inicio) => Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255);
  const lineal = valores.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
}

export function contrasteWcag(colorA: string, colorB: string): number {
  const [claro, oscuro] = [luminancia(colorA), luminancia(colorB)].sort((a, b) => b - a);
  return (claro + 0.05) / (oscuro + 0.05);
}
