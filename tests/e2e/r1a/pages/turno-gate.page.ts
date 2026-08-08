import { expect, type Page } from "@playwright/test";
import type { OperadorE2E } from "../fixtures/datos";

export class TurnoGatePage {
  constructor(private readonly page: Page) {}

  private async irAPos(): Promise<void> {
    const baseUrl = process.env.E2E_R1A_BASE_URL ?? "http://127.0.0.1:3000";
    await this.page.goto(new URL("/pos", baseUrl).toString());
  }

  async iniciarSesion(operador: OperadorE2E, opciones: { esperarCompuerta?: boolean } = {}): Promise<void> {
    await this.irAPos();
    await this.page.locator("#username").fill(operador.codigo);
    await this.page.locator("#password").fill(operador.pin);
    await this.page.getByRole("button", { name: "Iniciar Sesión" }).click();
    if (opciones.esperarCompuerta !== false) {
      await expect(this.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible({ timeout: 30_000 });
    }
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
