import assert from "node:assert/strict";
import test from "node:test";
import { crearPlantillaConfiguracionRevision1 } from "../../lib/configuracion/plantilla";
import { obtenerConfiguracionEmpresa } from "../../functions/src/tenant-configuration/shared";

const empresaId = "empresa-configuracion";
const uid = "usuario-configuracion";
const config = crearPlantillaConfiguracionRevision1({
  empresaId,
  nombreComercial: "Configuración",
  creadaEn: "test",
  actualizadaEn: "test",
  ultimaMutacion: {
    actorTipo: "SYSTEM",
    actorId: "test",
    origen: "BOOTSTRAP",
    commandId: "command",
    correlationId: "correlation",
  },
});

class Db {
  constructor(private readonly docs: Record<string, Record<string, unknown>>) {}

  collection(name: string) {
    return {
      doc: (id: string) => ({
        get: async () => {
          const data = this.docs[`${name}/${id}`];
          return { exists: !!data, data: () => data };
        },
      }),
    };
  }
}

function crearDb(opciones: {
  empresaId?: string;
  empresa?: Record<string, unknown> | null;
  membresia?: Record<string, unknown> | null;
  configuracion?: Record<string, unknown> | null;
} = {}) {
  const id = opciones.empresaId ?? empresaId;
  const empresa = opciones.empresa === undefined
    ? { estado: "activa", paisFiscal: "CO" }
    : opciones.empresa;
  const membresia = opciones.membresia === undefined
    ? { empresaId: id, uid, rol: "admin", permisos: ["sell"], estado: "activa", activo: true }
    : opciones.membresia;
  const configuracion = opciones.configuracion === undefined ? config : opciones.configuracion;
  return new Db({
    ...(empresa ? { [`empresas/${id}`]: empresa } : {}),
    ...(membresia ? { [`membresias/${id}_${uid}`]: membresia } : {}),
    ...(configuracion ? { [`configuraciones/${id}`]: configuracion as unknown as Record<string, unknown> } : {}),
  });
}

function solicitud(token: Record<string, unknown> = { empresaId, rol: "admin" }) {
  return { auth: { uid, token } };
}

async function rechazaConCodigo(promesa: Promise<unknown>, codigo: string) {
  await assert.rejects(promesa, (error: { code?: string }) => error.code === codigo);
}

test("deriva el tenant de claims e ignora autoridad enviada por cliente", async () => {
  const resultado = await obtenerConfiguracionEmpresa({
    ...solicitud(),
    data: { empresaId: "ajena", uid: "otro", membresiaId: "otra", rol: "admin" },
  }, crearDb() as never);
  assert.equal(resultado.empresaId, empresaId);
});

test("preserva auth ausente, claim inválido, empresa inexistente y no operativa", async () => {
  await rechazaConCodigo(obtenerConfiguracionEmpresa({}, crearDb() as never), "unauthenticated");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud({ rol: "admin" }), crearDb() as never), "permission-denied");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud({ empresaId: "", rol: "admin" }), crearDb() as never), "permission-denied");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud({ empresaId: 7, rol: "admin" }), crearDb() as never), "permission-denied");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud({ empresaId: "empresa-ausente", rol: "admin" }), crearDb({ empresaId: "empresa-ausente", empresa: null }) as never), "permission-denied");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud(), crearDb({ empresa: { estado: "suspendida", paisFiscal: "CO" } }) as never), "permission-denied");
});

test("preserva membresía ausente o inválida y rol incoherente", async () => {
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud(), crearDb({ membresia: null }) as never), "unauthenticated");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud(), crearDb({ membresia: { empresaId, uid, rol: "admin", permisos: [7], estado: "activa", activo: true } }) as never), "unauthenticated");
  await rechazaConCodigo(obtenerConfiguracionEmpresa(solicitud({ empresaId, rol: "cajero" }), crearDb() as never), "permission-denied");
});
