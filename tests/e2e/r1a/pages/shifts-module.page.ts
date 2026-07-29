import { expect, type Page } from "@playwright/test";

export class ShiftsModulePage {
  constructor(private readonly page: Page) {}

  async abrirModulo(): Promise<void> {
    await this.page.getByRole("button", { name: "Turnos" }).click();
    await expect(this.page.getByRole("heading", { name: "Turnos" })).toBeVisible();
  }

  async abrirTurno(baseApertura = "150000", notas = "Apertura E2E desde turnos"): Promise<void> {
    await this.page.getByRole("button", { name: "Abrir Turno" }).click();
    await expect(this.page.getByText("Apertura de Turno")).toBeVisible();
    await this.page.getByPlaceholder("0").fill(baseApertura);
    await this.page.getByPlaceholder("Observaciones al iniciar el turno...").fill(notas);
    await this.page.getByRole("button", { name: "Iniciar Turno" }).click();
  }
}
