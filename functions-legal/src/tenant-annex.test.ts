import assert from "node:assert/strict";
import test from "node:test";
import {
  crearSnapshotAnexoTenant,
  sha256SubencargadosRegistry,
  sha256TenantAnnex,
  validarAutoridadContacto,
  validarSnapshotAnexoPersistido,
} from "../../functions/src/legal/tenant-annex";

const projectId = "demo-legal-annex";
const empresaId = "tenant-synthetic-a";
const authority = {
  schemaVersion: 1,
  projectId,
  empresaId,
  revision: 2,
  estado: "ACTIVO",
  contacto: {
    id: "contact-synthetic-a",
    version: 2,
    canal: "EMAIL_VERIFICADO",
    designacionRef: "evidence:designation-synthetic-a",
    pruebaCanalRef: "evidence:channel-synthetic-a",
    designadoEn: "2026-11-27T15:00:00.000Z",
    verificadoEn: "2026-11-27T15:05:00.000Z",
  },
};
const annexRecord = {
  schemaVersion: 1,
  empresaId,
  revision: 3,
  estado: "VERIFICADO",
  perfil: { referenciaVerificacion: "profile:synthetic-a", nombreComercial: "Negocio sintético A", tipoPersona: "NATURAL", estado: "VERIFICADO", verificadoEn: "2026-11-27T15:00:00.000Z" },
  representante: { referenciaDesignacion: "evidence:representative-synthetic-a", estado: "VERIFICADO", designadoEn: "2026-11-27T15:00:00.000Z" },
  capacidades: ["inventory", "sell"],
  instrucciones: {
    referencia: "instruction:synthetic-a",
    estado: "CONFIRMADAS",
    confirmadasPorAdmin: "admin-synthetic-a",
    confirmadasEn: "2026-11-27T15:10:00.000Z",
    titulares: ["CLIENTES", "VENDEDORES"],
    categoriasDatos: ["TRANSACCIONES_COMERCIALES", "IDENTIFICACION_Y_CONTACTO"],
    finalidades: ["OPERAR_EL_POS", "GESTIONAR_CLIENTES_Y_PEDIDOS"],
    instruccionSalida: "DEVOLVER_Y_SUPRIMIR_SEGUN_RETENCIONES",
  },
  subencargados: {
    estadoRegistro: "VERIFICADO",
    versionRegistro: 4,
    sha256Registro: sha256SubencargadosRegistry([{ id: "provider-synthetic-a", producto: "Proveedor sintético", finalidad: "Procesamiento de prueba", paisIso2: "CO", instrumentoRef: "instrument:synthetic-a" }]),
    verificadoEn: "2026-11-27T15:15:00.000Z",
    entradas: [{
      id: "provider-synthetic-a", producto: "Proveedor sintético", finalidad: "Procesamiento de prueba",
      paisIso2: "CO", instrumentoRef: "instrument:synthetic-a", estado: "VERIFICADO",
    }],
  },
  conservacion: { estado: "VERIFICADO", version: 2, sha256: "b".repeat(64), respaldoRef: "backup-policy:synthetic-a", verificadoEn: "2026-11-27T15:20:00.000Z" },
  seguridad: { estado: "VERIFICADO", version: 2, sha256: "c".repeat(64), controlesRef: "security-controls:synthetic-a", verificadoEn: "2026-11-27T15:25:00.000Z" },
};

test("la ficha aceptable produce un snapshot determinista, por tenant y sin destino del contacto", () => {
  assert.equal(validarAutoridadContacto(authority, projectId, empresaId), true);
  const result = crearSnapshotAnexoTenant({ empresaId, authority, projectId, annexRecord, capacidadesContrato: ["sell", "inventory"] });
  assert.equal(result.disponible, true);
  if (!result.disponible) return;
  assert.equal(result.snapshot.empresaId, empresaId);
  assert.deepEqual(result.snapshot.capacidades, ["inventory", "sell"]);
  assert.equal(result.sha256, sha256TenantAnnex(result.snapshot));
  assert.equal(validarSnapshotAnexoPersistido(result.snapshot, empresaId, result.sha256), true);
  assert.doesNotMatch(JSON.stringify(result.snapshot), /@|synthetic-contact@example\.invalid/);
  assert.equal("destination" in result.snapshot.contactoPrivacidad, false);
  assert.equal("email" in result.snapshot.contactoPrivacidad, false);
});

test("la verificación del contacto no cruza proyecto ni tenant y no acepta autoridad revocada", () => {
  assert.equal(validarAutoridadContacto(authority, "production-project", empresaId), false);
  assert.equal(validarAutoridadContacto(authority, projectId, "tenant-synthetic-b"), false);
  assert.equal(validarAutoridadContacto({ ...authority, estado: "REVOCADO" }, projectId, empresaId), false);
});

test("la ficha bloquea datos incompletos, contacto no verificado y proveedores sin verificación", () => {
  const missing = crearSnapshotAnexoTenant({
    empresaId,
    authority: { ...authority, estado: "PENDIENTE" },
    projectId,
    annexRecord: { ...annexRecord, instrucciones: { ...annexRecord.instrucciones, finalidades: [] } },
    capacidadesContrato: ["sell", "inventory"],
  });
  assert.equal(missing.disponible, false);
  if (!missing.disponible) {
    assert.ok(missing.faltantes.includes("contacto representante verificado y activo"));
    assert.ok(missing.faltantes.includes("instrucciones y finalidades confirmadas por el negocio"));
  }

  const unverifiedProcessor = crearSnapshotAnexoTenant({
    empresaId,
    authority,
    projectId,
    annexRecord: { ...annexRecord, subencargados: { ...annexRecord.subencargados, entradas: [{ ...annexRecord.subencargados.entradas[0], estado: "PENDIENTE" }] } },
    capacidadesContrato: ["sell", "inventory"],
  });
  assert.equal(unverifiedProcessor.disponible, false);
  if (!unverifiedProcessor.disponible) assert.ok(unverifiedProcessor.faltantes.includes("inventario versionado y verificado de subencargados/regiones"));
});

test("el snapshot persistido detecta adulteración y capacidad fuera del contrato", () => {
  const result = crearSnapshotAnexoTenant({ empresaId, authority, projectId, annexRecord, capacidadesContrato: ["sell", "inventory"] });
  assert.equal(result.disponible, true);
  if (!result.disponible) return;
  assert.equal(validarSnapshotAnexoPersistido({ ...result.snapshot, capacidades: ["admin"] }, empresaId, result.sha256), false);
  assert.equal(crearSnapshotAnexoTenant({ empresaId, authority, projectId, annexRecord, capacidadesContrato: ["sell"] }).disponible, false);
});
