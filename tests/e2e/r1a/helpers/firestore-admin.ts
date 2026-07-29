import { adminE2E } from "../fixtures/entorno";

export async function esperarAperturaConfirmada(empresaId: string, cajeroId: string): Promise<{ turnoId: string }> {
  const { db } = adminE2E();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const turnos = await db.collection("turnos").where("empresaId", "==", empresaId).where("cajeroId", "==", cajeroId).where("estado", "==", "abierto").get();
    if (turnos.size === 1) {
      const turnoId = turnos.docs[0].id;
      const locks = await db.collection("turnos_activos").where("empresaId", "==", empresaId).where("cajeroId", "==", cajeroId).where("turnoId", "==", turnoId).get();
      const [recibos, indices, auditorias] = await Promise.all([
        db.collection("operaciones_comandos").where("empresaId", "==", empresaId).get(),
        db.collection("operaciones_command_idempotency").where("empresaId", "==", empresaId).get(),
        db.collection("operaciones_auditoria").where("empresaId", "==", empresaId).get(),
      ]);
      if (locks.size === 1 && recibos.size === 1 && indices.size === 1 && auditorias.size === 1) return { turnoId };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No se confirmó la apertura autoritativa para ${empresaId}/${cajeroId}.`);
}

export async function contarTurnosAbiertos(empresaId: string, cajeroId: string): Promise<number> {
  const { db } = adminE2E();
  return (await db.collection("turnos").where("empresaId", "==", empresaId).where("cajeroId", "==", cajeroId).where("estado", "==", "abierto").get()).size;
}
