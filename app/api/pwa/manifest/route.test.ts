import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { GET } from "./route"

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string }

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "el recurso debe ser PNG")
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

test("el manifiesto estático declara iconos cuadrados reales y un icono Apple", async () => {
  const manifest = JSON.parse(await readFile("public/manifest.json", "utf8")) as {
    icons: ManifestIcon[]
    id: string
    start_url: string
    scope: string
    display: string
  }
  assert.equal(manifest.id, "/admin")
  assert.equal(manifest.start_url, "/admin")
  assert.equal(manifest.scope, "/admin")
  assert.equal(manifest.display, "standalone")

  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png")
    const expectedSize = Number(icon.sizes.split("x")[0])
    assert.ok(expectedSize === 192 || expectedSize === 512)
    assert.equal(icon.purpose, "any maskable")
    const bytes = await readFile(`public${icon.src}`)
    assert.deepEqual(pngDimensions(bytes), { width: expectedSize, height: expectedSize })
  }

  const appleIcon = await readFile("public/apple-touch-icon.png")
  assert.deepEqual(pngDimensions(appleIcon), { width: 180, height: 180 })
})

test("el manifiesto neutral tenant-aware mantiene iconos válidos para instalar", async () => {
  const response = await GET(new Request("https://pos.dusema.com/api/pwa/manifest?empresaId=invalid%20id"))
  assert.equal(response.status, 200)
  const manifest = await response.json() as { id: string; prefer_related_applications: boolean; icons: ManifestIcon[] }
  assert.equal(manifest.id, "/admin")
  assert.equal(manifest.prefer_related_applications, false)
  assert.deepEqual(manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })), [
    { src: "/dusema-pos-icon-192.png", sizes: "192x192", purpose: "any maskable" },
    { src: "/dusema-pos-icon-512.png", sizes: "512x512", purpose: "any maskable" },
  ])
})
