import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getMessaging } from "firebase-admin/messaging";
import { reconciliarAgendaPedidosBodega } from "./agenda-worker";
import { ejecutarCrearClienteVendedor } from "../../functions/src/bodega-vendedor/clientes";
import {
  ejecutarActualizarPresentacionComercialV1,
  ejecutarCrearPresentacionComercialV1,
} from "../../functions/src/bodega-vendedor/presentaciones";
import { ejecutarConfirmarVentaBodegaV1 } from "../../functions/src/bodega-vendedor/ventas-confirmation";
import {
  ejecutarCancelarSolicitudVentaBodegaV1,
  ejecutarConsultarSolicitudesVentaBodegaV1,
  ejecutarCrearSolicitudVentaBodegaV1,
  ejecutarResolverSolicitudVentaBodegaV1,
} from "../../functions/src/bodega-vendedor/solicitudes-venta";
import { ejecutarCrearArticuloInventarioV1 } from "../../functions/src/inventario/callables";
import { ejecutarCrearCategoriaBodegaV1 } from "../../functions/src/bodega/categorias";
import { leerConfiguracionEmpresa } from "../../functions/src/configuracion/reader";
import { exigirTenantActivo } from "../../functions/src/tenant-configuration/authority";
import {
  ejecutarCancelarProgramacionPedidoBodegaV1,
  ejecutarConsultarAgendaPedidosBodegaV1,
  ejecutarConvertirProgramacionPedidoBodegaV1,
  ejecutarCrearProgramacionPedidoBodegaV1,
  ejecutarResolverProgramacionPedidoBodegaV1,
} from "../../functions/src/bodega-vendedor/agenda-pedidos";

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

export const crearSolicitudVentaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarCrearSolicitudVentaBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const consultarSolicitudesVentaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarConsultarSolicitudesVentaBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const resolverSolicitudVentaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarResolverSolicitudVentaBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const cancelarSolicitudVentaBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  return ejecutarCancelarSolicitudVentaBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const crearProgramacionPedidoBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarCrearProgramacionPedidoBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const resolverProgramacionPedidoBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarResolverProgramacionPedidoBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const cancelarProgramacionPedidoBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarCancelarProgramacionPedidoBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const consultarAgendaPedidosBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarConsultarAgendaPedidosBodegaV1(db, await contextoOperativo(request, db), request.data);
});

export const convertirProgramacionPedidoBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  return ejecutarConvertirProgramacionPedidoBodegaV1(db, await contextoOperativo(request, db), request.data);
});

/** Despacho durable y expiración de holds; no requiere Secrets adicionales. */
export const reconciliarAgendaPedidosBodegaV1 = onSchedule(
  { region: REGION, schedule: "every 5 minutes", timeZone: "UTC" },
  async () => { await reconciliarAgendaPedidosBodega(getFirestore(), getMessaging()); },
);
