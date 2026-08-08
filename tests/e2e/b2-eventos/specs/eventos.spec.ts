import { test, expect } from "@playwright/test"
import { appendFileSync } from "node:fs"
import {
  B2_PUBLIC_SLUG_A,
  B2_PUBLIC_SLUG_AMBIGUA,
  B2_PUBLIC_SLUG_B,
  B2_PUBLIC_SLUG_SUSPENDIDA,
  limpiarFixtureB2,
  prepararFixtureB2,
} from "../fixtures/datos"

test.describe("B2 — lectura pública tenant-aware de eventos", () => {
  test.beforeAll(async () => {
    await prepararFixtureB2()
  })

  test.afterAll(async () => {
    await limpiarFixtureB2()
  })

  test("la landing muestra solo eventos del tenant contextualizado y no consulta Firestore desde el cliente", async ({ page }, testInfo) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const directFirestoreRequests: string[] = []
    const apiFailures: string[] = []
    const apiResponses: string[] = []

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => pageErrors.push(error.message))
    page.on("request", (request) => {
      const url = request.url()
      if (/firestore\.googleapis\.com|googleapis\.com\/google\.firestore|127\.0\.0\.1:8080/.test(url)) {
        directFirestoreRequests.push(url)
      }
    })
    page.on("response", (response) => {
      if (response.url().includes("/api/public/eventos")) {
        apiResponses.push(`${response.status()} ${response.url()}`)
        if (response.status() >= 400) apiFailures.push(`${response.status()} ${response.url()}`)
      }
    })

    await page.goto("/")
    await expect(page.getByTestId("public-events")).toBeVisible()
    await expect(page.getByText("Evento público A", { exact: true })).toBeVisible()
    await expect(page.getByText("Evento público B", { exact: true })).toHaveCount(0)
    await expect(page.getByText("Evento legacy", { exact: true })).toHaveCount(0)

    expect(apiResponses.some((response) => response.startsWith("200 "))).toBe(true)
    expect(apiFailures).toEqual([])
    expect(directFirestoreRequests).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])

    appendFileSync(testInfo.outputPath("b2-runtime.json"), `${JSON.stringify({
      consoleErrors,
      pageErrors,
      directFirestoreRequests,
      apiResponses,
      apiFailures,
      tenantSlug: B2_PUBLIC_SLUG_A,
    }, null, 2)}\n`)
  })

  test("el endpoint aísla tenants y rechaza contexto inexistente, ambiguo o suspendido", async ({ request }) => {
    const casos = [
      { slug: B2_PUBLIC_SLUG_A, status: 200, titulos: ["Evento público A"] },
      { slug: B2_PUBLIC_SLUG_B, status: 200, titulos: ["Evento público B"] },
      { slug: "no-existe", status: 404, titulos: [] },
      { slug: B2_PUBLIC_SLUG_AMBIGUA, status: 404, titulos: [] },
      { slug: B2_PUBLIC_SLUG_SUSPENDIDA, status: 404, titulos: [] },
    ]

    for (const caso of casos) {
      const response = await request.get(`/api/public/eventos?slug=${encodeURIComponent(caso.slug)}`)
      expect(response.status(), caso.slug).toBe(caso.status)
      const body = await response.json()
      expect(body.eventos?.map((evento: { titulo: string }) => evento.titulo) ?? [], caso.slug).toEqual(caso.titulos)
      if (caso.status === 200) {
        expect(body.eventos[0].empresaId, "empresaId no debe convertirse en dato público").toBeUndefined()
        expect(body.eventos[0].creadoPor, "creadoPor no debe exponerse").toBeUndefined()
      }
    }
  })
})
