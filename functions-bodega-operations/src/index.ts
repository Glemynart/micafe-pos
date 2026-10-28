import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  ejecutarConsultarClientesVendedor,
} from "../../functions/src/bodega-vendedor/clientes";
import {
  ejecutarConsultarCatalogoPresentacionesVendedor,
} from "../../functions/src/bodega-vendedor/presentaciones";
import { ejecutarConsultarMisVentasVendedor } from "../../functions/src/bodega-vendedor/lecturas";
import { ejecutarConsultarCatalogoNeveraVendedorV1 } from "../../functions/src/bodega-vendedor/nevera-retail";
import { ejecutarActualizarArticuloInventarioV1 } from "../../functions/src/inventario/callables";
import { ejecutarCerrarTurnoOperativoV1 } from "../../functions/src/bodega/close-turn";
import { manejarAbrirTurnoOperativo } from "../../functions/src/turnos/callable";
import { leerConfiguracionEmpresa } from "../../functions/src/configuracion/reader";
import { exigirTenantActivo } from "../../functions/src/tenant-configuration/authority";
import { ejecutarRegistrarCompraBodegaV1 } from "../../functions/src/finanzas/compra-core";
import { exigirCompraBodegaHabilitada, validarPayloadCompraBodega } from "./purchase-policy";

if (!getApps().length) initializeApp();

const REGION = "us-central1";

async function contextoVendedor(request: Parameters<typeof exigirTenantActivo>[0], db: ReturnType<typeof getFirestore>) {
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return {
    empresaId: tenant.id,
    actorUid: request.auth!.uid,
    rol: tenant.rol,
    permisos: tenant.permisos,
    vertical: configuracion.vertical,
    inventoryHabilitado: configuracion.modulos.habilitados.includes("inventory"),
    clientesHabilitados: configuracion.modulos.habilitados.includes("clientes"),
  };
}

export const consultarCatalogoPresentacionesVendedorBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const contexto = await contextoVendedor(request, db);
  return ejecutarConsultarCatalogoPresentacionesVendedor(db, contexto, request.data);
});

export const consultarCatalogoNeveraVendedorBodegaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const contexto = await contextoVendedor(request, db);
  return ejecutarConsultarCatalogoNeveraVendedorV1(db, contexto, request.data);
});

export const consultarClientesVendedorBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const contexto = await contextoVendedor(request, db);
  return ejecutarConsultarClientesVendedor(db, contexto, request.data);
});

export const consultarMisVentasVendedorBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const contexto = await contextoVendedor(request, db);
  return ejecutarConsultarMisVentasVendedor(db, contexto, request.data);
});

export const actualizarArticuloInventarioBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarActualizarArticuloInventarioV1(db, {
    empresaId: tenant.id,
    actorUid: request.auth!.uid,
    rol: tenant.rol,
  }, request.data);
});

export const abrirTurnoBodegaV1 = onCall({ region: REGION }, async (request) => manejarAbrirTurnoOperativo(getFirestore(), request));

export const cerrarTurnoBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarCerrarTurnoOperativoV1(db, {
    empresaId: tenant.id,
    actorUid: request.auth!.uid,
    rol: tenant.rol,
  }, request.data);
});

export const registrarCompraBodegaV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  exigirCompraBodegaHabilitada(configuracion);
  validarPayloadCompraBodega(request.data?.payload);
  return ejecutarRegistrarCompraBodegaV1(db, {
    empresaId: tenant.id,
    actorUid: request.auth!.uid,
    rol: tenant.rol,
  }, request.data);
});
