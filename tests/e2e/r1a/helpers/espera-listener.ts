import { expect, type Page } from "@playwright/test";

/** La UI no se considera confirmada hasta que desaparece la compuerta por su listener. */
export async function esperarConfirmacionListener(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Abre tu turno" })).toHaveCount(0);
}
