import assert from "node:assert/strict"
import test from "node:test"
import {
  procesarSolicitudPush,
  type DependenciasEndpointPush,
} from "./notificaciones-push-endpoint"
import type { ClaimsPush, MembresiaPush } from "./notificaciones-push-auth"

const claimsValidos: ClaimsPush = { uid: "uid-a", empresaId: "tenant-a", rol: "admin" }
const membresiaValida: MembresiaPush = {
  uid: "uid-a",
  empresaId: "tenant-a",
  rol: "admin",
  estado: "activa",
  activo: true,
}

function dependencias(overrides: Partial<DependenciasEndpointPush> = {}) {
  const llamadas = {
    token: "" as string,
    revocationChecked: false,
    membership: [] as string[],
    sends: [] as Array<{ empresaId: string; title: string; body: string; url?: string }>,
    errors: [] as string[],
  }
  const deps: DependenciasEndpointPush = {
    async verifyIdToken(token, checkRevoked) {
      llamadas.token = token
      llamadas.revocationChecked = checkRevoked
      return claimsValidos
    },
    async obtenerMembresia(empresaId, uid) {
      llamadas.membership.push(`${empresaId}/${uid}`)
      return membresiaValida
    },
    async enviarPushAdmins(params) {
      llamadas.sends.push(params)
      return { enviados: 1, purgados: 0 }
    },
    registrarError(nombre) {
      llamadas.errors.push(nombre)
    },
    ...overrides,
  }
  return { deps, llamadas }
}

function solicitud(body?: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request("https://pos.dusema.com/api/notifications/send", {
    method: "POST",
    headers,
    body,
  })
}

async function procesar(body: BodyInit | null, overrides: Partial<DependenciasEndpointPush> = {}, headers: Record<string, string> = {}) {
  const { deps, llamadas } = dependencias(overrides)
  const response = await procesarSolicitudPush(
    solicitud(body, { Authorization: "Bearer token-de-prueba", "Content-Type": "application/json", ...headers }),
    deps,
  )
  return { response, llamadas }
}

test("exige Bearer y limita su longitud antes de verificar el token", async () => {
  const sinBearer = dependencias()
  const sinAutorizacion = await procesarSolicitudPush(solicitud("{}"), sinBearer.deps)
  assert.equal(sinAutorizacion.status, 401)
  assert.equal(sinBearer.llamadas.token, "")

  const demasiadoLargo = dependencias()
  const response = await procesarSolicitudPush(
    solicitud("{}", { Authorization: `Bearer ${"x".repeat(8192)}` }),
    demasiadoLargo.deps,
  )
  assert.equal(response.status, 401)
  assert.equal(demasiadoLargo.llamadas.token, "")
})

test("verifica revocación y autoriza solo claims con tenant, UID y rol admitidos", async () => {
  const correcta = await procesar(JSON.stringify({ title: "  Aviso  ", message: "Mensaje", url: "/admin/solicitudes" }))
  assert.equal(correcta.response.status, 200)
  assert.equal(correcta.llamadas.revocationChecked, true)
  assert.equal(correcta.llamadas.membership[0], "tenant-a/uid-a")
  assert.deepEqual(correcta.llamadas.sends, [{
    empresaId: "tenant-a",
    title: "Aviso",
    body: "Mensaje",
    url: "/admin/solicitudes",
  }])

  for (const rol of ["admin", "cajero", "supervisor"]) {
    const { response, llamadas } = await procesar(
      JSON.stringify({ title: "Aviso", message: "Mensaje" }),
      {
        async verifyIdToken() { return { ...claimsValidos, rol } },
        async obtenerMembresia() { return { ...membresiaValida, rol } },
      },
    )
    assert.equal(response.status, 200, rol)
    assert.equal(llamadas.sends.length, 1, rol)
  }

  for (const invalidClaims of [
    { ...claimsValidos, uid: "" },
    { ...claimsValidos, empresaId: undefined },
    { ...claimsValidos, rol: "vendedor" },
  ]) {
    const { response, llamadas } = await procesar(
      JSON.stringify({ title: "Aviso", message: "Mensaje" }),
      { async verifyIdToken() { return invalidClaims } },
    )
    assert.equal(response.status, 403)
    assert.equal(llamadas.membership.length, 0)
    assert.equal(llamadas.sends.length, 0)
  }
})

test("bloquea membresías ausentes, inactivas o que no coinciden con el tenant/identidad/rol", async () => {
  const membresiasInvalidas: Array<MembresiaPush | undefined> = [
    undefined,
    { ...membresiaValida, estado: "suspendida" },
    { ...membresiaValida, activo: false },
    { ...membresiaValida, uid: "uid-b" },
    { ...membresiaValida, empresaId: "tenant-b" },
    { ...membresiaValida, rol: "cajero" },
  ]

  for (const membresia of membresiasInvalidas) {
    const { response, llamadas } = await procesar(
      JSON.stringify({ title: "Aviso", message: "Mensaje" }),
      { async obtenerMembresia() { return membresia } },
    )
    assert.equal(response.status, 403)
    assert.equal(llamadas.sends.length, 0)
  }
})

test("los fallos de token o envío devuelven un error genérico sin filtrar el detalle", async () => {
  const secreto = "detalle-interno-que-no-debe-filtrarse"
  const tokenRevocado = await procesar("{}", {
    async verifyIdToken() { throw new Error(secreto) },
  })
  assert.equal(tokenRevocado.response.status, 500)
  assert.deepEqual(tokenRevocado.response.body, { error: "No fue posible enviar la notificación." })
  assert.deepEqual(tokenRevocado.llamadas.errors, ["Error"])
  assert.equal(JSON.stringify(tokenRevocado.response.body).includes(secreto), false)

  const errorEnvio = await procesar(JSON.stringify({ title: "Aviso", message: "Mensaje" }), {
    async enviarPushAdmins() { throw new Error(secreto) },
  })
  assert.deepEqual(errorEnvio.response.body, { error: "No fue posible enviar la notificación." })
  assert.equal(JSON.stringify(errorEnvio.response.body).includes(secreto), false)
})

test("limita el tamaño declarado y el tamaño real transmitido", async () => {
  const declarado = await procesar("{}", {}, { "content-length": "4097" })
  assert.equal(declarado.response.status, 413)
  assert.equal(declarado.llamadas.sends.length, 0)

  const cuerpoExcesivo = "x".repeat(4097)
  const real = await procesar(cuerpoExcesivo)
  assert.equal(real.response.status, 413)
  assert.equal(real.llamadas.sends.length, 0)

  for (const contentLength of ["no-es-numero", "-1", "9007199254740992"]) {
    const invalido = await procesar("{}", {}, { "content-length": contentLength })
    assert.equal(invalido.response.status, 400, contentLength)
    assert.equal(invalido.llamadas.sends.length, 0)
  }
})

test("rechaza JSON mal formado, arreglos y longitudes o tipos inválidos", async () => {
  const casos: Array<[string, number]> = [
    ["{", 400],
    ["[]", 400],
    [JSON.stringify({ title: " ", message: "Mensaje" }), 400],
    [JSON.stringify({ title: "A".repeat(121), message: "Mensaje" }), 400],
    [JSON.stringify({ title: "Aviso", message: "M".repeat(1001) }), 400],
    [JSON.stringify({ title: "Aviso", message: "Mensaje", url: "https://evil.example" }), 400],
    [JSON.stringify({ title: "Aviso", message: "Mensaje", url: "//evil.example" }), 400],
    [JSON.stringify({ title: "Aviso", message: "Mensaje", url: "/\\evil.example" }), 400],
    [JSON.stringify({ title: "Aviso", message: "Mensaje", url: 7 }), 400],
  ]

  for (const [body, status] of casos) {
    const { response, llamadas } = await procesar(body)
    assert.equal(response.status, status, body.slice(0, 40))
    assert.equal(llamadas.sends.length, 0)
  }
})

test("permite únicamente rutas internas dentro de Admin y POS", async () => {
  for (const url of ["/admin", "/admin/solicitudes", "/pos", "/pos/ventas"]) {
    const { response, llamadas } = await procesar(JSON.stringify({ title: "Aviso", message: "Mensaje", url }))
    assert.equal(response.status, 200, url)
    assert.equal(llamadas.sends[0].url, url)
  }
})
