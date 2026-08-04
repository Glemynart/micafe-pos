import { writeFileSync } from "node:fs";
import {
  EVIDENCE_DIR,
  PASSWORD,
  PROJECT_ID,
  RUN_ID,
  adminEmuladores,
  asegurarDirectorioEvidencia,
  huella,
  snapshotCompleto,
  tenantSpecs,
} from "./p0-10-fixture";

async function main(): Promise<void> {
const { auth, db } = adminEmuladores();
const specs = tenantSpecs();

for (const spec of specs) {
  await auth.createUser({ uid: spec.ownerUid, email: spec.email, password: PASSWORD, displayName: `Administrador ${spec.nombre}` });
  const batch = db.batch();
  batch.set(db.collection("empresas").doc(spec.empresaId), {
    empresaId: spec.empresaId,
    nombre: spec.nombre,
    nombreComercial: spec.nombre,
    estado: "trial",
    esFundacional: false,
    revision: 1,
  });
  batch.set(db.collection("usuarios").doc(spec.ownerUid), {
    empresaId: spec.empresaId,
    uid: spec.ownerUid,
    nombre: `Administrador ${spec.nombre}`,
    username: spec.email,
    activo: true,
  });
  batch.set(db.collection("membresias").doc(`${spec.empresaId}_${spec.ownerUid}`), {
    empresaId: spec.empresaId,
    uid: spec.ownerUid,
    rol: "admin",
    permisos: ["sell", "inventory", "shifts", "finanzas"],
    estado: "activa",
    activo: true,
  });
  batch.set(db.collection("configuraciones").doc(spec.empresaId), {
    empresaId: spec.empresaId,
    revision: 1,
    nombreComercial: spec.nombre,
    identidadFiscal: { estado: "PENDIENTE_CONFIGURACION" },
    modulos: { habilitados: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts"] },
  });
  batch.set(db.collection("espacios").doc(spec.espacioId), {
    empresaId: spec.empresaId,
    nombre: "Cafetería de prueba",
    activo: true,
    orden: 1,
  });
  batch.set(db.collection("categorias").doc(spec.categoriaId), {
    empresaId: spec.empresaId,
    espacioId: spec.espacioId,
    nombre: "Demostración",
    activo: true,
  });
  batch.set(db.collection("cuentas_bancarias").doc(spec.cuentaId), {
    id: spec.cuentaId,
    empresaId: spec.empresaId,
    claveOperativa: "caja-principal",
    nombre: "Caja de prueba",
    saldo: 100000,
  });
  batch.set(db.collection("productos").doc(spec.productoId), {
    empresaId: spec.empresaId,
    espacioId: spec.espacioId,
    categoriaId: spec.categoriaId,
    nombre: "Café de prueba",
    precio: spec.totalVenta,
    stock: 25,
    secuenciaLedger: 1,
    activo: true,
  });
  batch.set(db.collection("turnos").doc(spec.turnoId), {
    id: spec.turnoId,
    empresaId: spec.empresaId,
    cajeroId: spec.ownerUid,
    cajeroNombre: `Administrador ${spec.nombre}`,
    estado: "cerrado",
    baseApertura: 100000,
    totalEsperadoEfectivo: 100000 + spec.totalVenta,
    totalReportadoEfectivo: 100000 + spec.totalVenta,
    diferenciaEfectivo: 0,
  });
  batch.set(db.collection("ventas").doc(spec.ventaId), {
    id: spec.ventaId,
    empresaId: spec.empresaId,
    modoOperacion: "DEMO",
    referenciaOperacion: `DEMO-${spec.ventaId}`,
    estado: "pagada",
    estadoOperativo: "COMPLETO",
    turnoId: spec.turnoId,
    metodoPago: "efectivo",
    totales: { total: spec.totalVenta },
    items: [{ id: spec.productoId, cantidad: 1, precioUnitario: spec.totalVenta }],
  });
  batch.set(db.collection("transacciones_financieras").doc(spec.movimientoId), {
    id: spec.movimientoId,
    empresaId: spec.empresaId,
    tipo: "ingreso",
    monto: spec.totalVenta,
    categoria: "ventas",
    cuentaDocumentoId: spec.cuentaId,
    cuentaClaveSnapshot: "caja-principal",
    ventaId: spec.ventaId,
    turnoId: spec.turnoId,
  });
  batch.set(db.collection("operaciones_auditoria").doc(spec.auditoriaId), {
    empresaId: spec.empresaId,
    tipo: "VentaDemo",
    resultado: "CONFIRMADO",
    actor: { uid: spec.ownerUid, rolEfectivo: "admin" },
    referencias: { ventaId: spec.ventaId, turnoId: spec.turnoId },
  });
  await batch.commit();
}

asegurarDirectorioEvidencia();
const snapshot = await snapshotCompleto(db, specs);
writeFileSync(`${EVIDENCE_DIR}/seed-manifest.json`, `${JSON.stringify({
  schemaVersion: 1,
  runId: RUN_ID,
  projectId: PROJECT_ID,
  tenants: specs.map(({ email, ...safe }) => ({ ...safe, email })),
  snapshotDigest: huella(snapshot),
  seededCollections: ["empresa", "usuario", "membresia", "configuracion", "espacio", "categoria", "cuenta", "producto", "turno", "venta", "movimiento", "auditoria"],
}, null, 2)}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
