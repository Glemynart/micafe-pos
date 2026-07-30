import type { Firestore } from "firebase-admin/firestore";
import {
  CONFIGURACIONES_COLLECTION,
  inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion,
} from "./service";

/**
 * Identificador histórico fijado por MT-U1. Esta migración no descubre ni
 * elige tenants: regulariza exclusivamente el tenant fundacional conocido.
 */
export const EMPRESA_FUNDACIONAL_ID = "1ae0rD9H8t3ZFSBKrrHR";

const COMMAND_ID = "migracion_configuracion_fundacional_b1_v1";
const CORRELATION_ID = "migracion_configuracion_fundacional_b1";

export interface ResultadoMigracionConfiguracionFundacional {
  empresaId: typeof EMPRESA_FUNDACIONAL_ID;
  creada: boolean;
  idempotente: boolean;
}

/**
 * Crea la revisión inicial B1 que falta al tenant fundacional.
 *
 * La lectura de existencia y la inicialización comparten transacción. Un
 * documento ya presente se considera la evidencia de una migración previa y
 * se deja intacto, incluso si su contenido requiere un diagnóstico separado.
 */
export async function migrarConfiguracionEmpresaFundacional(
  db: Firestore,
): Promise<ResultadoMigracionConfiguracionFundacional> {
  const empresaRef = db.collection("empresas").doc(EMPRESA_FUNDACIONAL_ID);
  const configuracionRef = db.collection(CONFIGURACIONES_COLLECTION).doc(EMPRESA_FUNDACIONAL_ID);

  return db.runTransaction(async (tx) => {
    const [empresaSnap, configuracionSnap] = await Promise.all([
      tx.get(empresaRef),
      tx.get(configuracionRef),
    ]);

    if (configuracionSnap.exists) {
      return {
        empresaId: EMPRESA_FUNDACIONAL_ID,
        creada: false,
        idempotente: true,
      };
    }

    const empresa = empresaSnap.data();
    const nombreComercial = typeof empresa?.nombreComercial === "string"
      ? empresa.nombreComercial.trim()
      : typeof empresa?.nombre === "string"
        ? empresa.nombre.trim()
        : "";
    const paisFiscal = typeof empresa?.paisFiscal === "string" ? empresa.paisFiscal.trim() : "";

    inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion(
      db,
      tx,
      {
        empresaId: EMPRESA_FUNDACIONAL_ID,
        nombreComercial,
        paisFiscal,
        commandId: COMMAND_ID,
        correlationId: CORRELATION_ID,
        origen: "BACKFILL",
      },
      empresa ?? {},
      configuracionSnap,
    );

    return {
      empresaId: EMPRESA_FUNDACIONAL_ID,
      creada: true,
      idempotente: false,
    };
  });
}
