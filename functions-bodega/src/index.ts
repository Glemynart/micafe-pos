import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { ejecutarCrearClienteVendedor } from "../../functions/src/bodega-vendedor/clientes";
import {
  ejecutarActualizarPresentacionComercialV1,
  ejecutarCrearPresentacionComercialV1,
} from "../../functions/src/bodega-vendedor/presentaciones";
import { ejecutarConfirmarVentaBodegaV1 } from "../../functions/src/bodega-vendedor/ventas-confirmation";
import { ejecutarCrearArticuloInventarioV1 } from "../../functions/src/inventario/callables";
import { ejecutarCrearCategoriaBodegaV1 } from "../../functions/src/bodega/categorias";
import { leerConfiguracionEmpresa } from "../../functions/src/configuracion/reader";
import { exigirTenantActivo } from "../../functions/src/tenant-configuration/authority";

if (!getApps().length) initializeApp();

const REGION = "us-central1";

async function contextoOperativo(request: Parameters<typeof exigirTenantActivo>[0], db: ReturnType<typeof getFirestore>) {
  const tenant = await exigirTenantActivo(request, db);
  return { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol };
}

/** Frontera Bodega aislada: comandos Gen2, sin Secrets. */
export const crearCategoriaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarCrearCategoriaBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const crearClienteVendedorV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return ejecutarCrearClienteVendedor(db, {
    empresaId: tenant.id,
    rol: tenant.rol,
    permisos: tenant.permisos,
    clientesHabilitados: configuracion.modulos.habilitados.includes("clientes"),
  }, request.data);
});

export const crearPresentacionComercialV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarCrearPresentacionComercialV1(db, await contextoOperativo(request, db), request.data);
});

export const actualizarPresentacionComercialV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarActualizarPresentacionComercialV1(db, await contextoOperativo(request, db), request.data);
});

export const crearArticuloInventarioV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarCrearArticuloInventarioV1(db, await contextoOperativo(request, db), request.data);
});

export const confirmarVentaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarConfirmarVentaBodegaV1(db, await contextoOperativo(request, db), request.data);
});
