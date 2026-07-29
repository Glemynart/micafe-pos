import { expect, type Page } from "@playwright/test";
import type { OperadorE2E } from "../fixtures/datos";

export class TurnoGatePage {
  constructor(private readonly page: Page) {}

  async iniciarSesion(operador: OperadorE2E): Promise<void> {
    await this.page.goto("/pos");
    await this.page.locator("#username").fill(operador.codigo);
    await this.page.locator("#password").fill(operador.pin);
    await this.page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(this.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible();
  }

  async abrir(baseApertura = "150000", notas = "Apertura E2E"): Promise<void> {
    await this.page.getByPlaceholder("0").fill(baseApertura);
    await this.page.getByPlaceholder("Observaciones al iniciar el turno...").fill(notas);
    await this.page.getByRole("button", { name: "Iniciar Turno" }).click();
  }

  async esperarDesbloqueo(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Abre tu turno" })).toHaveCount(0);
  }
}
