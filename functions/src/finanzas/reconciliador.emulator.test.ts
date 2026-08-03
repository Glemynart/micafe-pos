import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { reconciliarVentasPendientes } from "./reconciliador";

const host = process.env.FIRESTORE_EMULATOR_HOST;

test("R1-B.2 Emulator: resuelve el contexto histórico desde el recibo fiscal", { skip: !host }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const empresaId = `empresa_emulator_${suffix}`;
  const ventaId = `venta_emulator_${suffix}`;
  const app = initializeApp({ projectId: "demo-mt-u4-rules" }, `reconciliador-${suffix}`);
  const db = getFirestore(app);

  try {
    const batch = db.batch();
    batch.set(db.collection("empresas").doc(empresaId), { estado: "activa" });
    batch.set(db.collection("cuentas_bancarias").doc("caja-principal"), { empresaId, saldo: 0, claveOperativa: "caja-principal", nombre: "Caja" });
    batch.set(db.collection("turnos").doc(`turno_${suffix}`), { empresaId, estado: "cerrado" });
    batch.set(db.collection("productos").doc(`cafe_${suffix}`), { empresaId, nombre: "Cafe", stock: 5, secuenciaLedger: 0, costo: 10 });
    batch.set(db.collection("ventas").doc(ventaId), {
      empresaId,
      cajeroId: "actor-no-autoritativo",
      rolCajeroSnapshot: "admin",
      estadoOperativo: "PENDIENTE_EFECTOS",
      turnoId: `turno_${suffix}`,
      metodoPago: "efectivo",
      totales: { total: 100 },
      items: [{ id: `cafe_${suffix}`, cantidad: 1 }],
    });
    batch.set(db.collection("fiscal_comandos").doc(`recibo_${suffix}`), {
      ventaId,
      empresaId,
      actorOriginal: { uid: "cajero-canonico", rolEfectivo: "cajero" },
      commandId: `confirmar_${suffix}`,
      idempotencyKey: `idem_confirmar_${suffix}`,
      correlationId: `corr_${suffix}`,
      causationId: `causa_${suffix}`,
    });
    await batch.commit();

    const resultado = await reconciliarVentasPendientes(db);
    assert.deepEqual(resultado, { procesadas: 1, completadas: 1, pendientes: 0 });

    const [venta, movimientos, auditorias] = await Promise.all([
      db.collection("ventas").doc(ventaId).get(),
      db.collection("transacciones_financieras").where("ventaId", "==", ventaId).get(),
      db.collection("operaciones_auditoria").where("empresaId", "==", empresaId).get(),
    ]);
    assert.equal(venta.data()?.estadoOperativo, "COMPLETO");
    assert.equal(movimientos.size, 1);
    assert.equal(movimientos.docs[0].data().usuarioId, "cajero-canonico");
    assert.equal(movimientos.docs[0].data().rolEfectivoSnapshot, "cajero");
    assert.equal(movimientos.docs[0].data().commandId, `efectos-venta:${ventaId}`);
    assert.equal(auditorias.size, 1);
    assert.deepEqual(auditorias.docs[0].data().actor, { uid: "cajero-canonico", rolEfectivo: "cajero" });
    assert.equal(auditorias.docs[0].data().comando.id, `efectos-venta:${ventaId}`);
    assert.equal(auditorias.docs[0].data().causationId, `causa_${suffix}`);
    assert.equal(auditorias.docs[0].data().comando.correlationId, `corr_${suffix}`);
    assert.equal(auditorias.docs[0].data().ejecutorTecnico, "reconciliarVentasPendientesOperativas");
  } finally {
    await deleteApp(app);
  }
});
