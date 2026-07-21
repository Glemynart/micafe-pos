import assert from "node:assert/strict";
import test from "node:test";
import {
  extraerEmpresaIdTenant,
} from "./operational-auth";
import {
  esIncorporacionEmailReutilizable,
  EMAIL_INVITATION_MAX_RESENDS,
  EMAIL_INVITATION_RESEND_COOLDOWN_MS,
  EMAIL_INVITATION_TTL_MS,
  digestTokenEmail,
  idIncorporacionDirecta,
  idIncorporacionEmail,
  idAuditoriaActivacion,
  planificarActivacionDirecta,
  planificarReenvioEmail,
  prepararActivacionDirecta,
  prepararIncorporacionDirecta,
  prepararIncorporacionEmail,
  validarEstadoInicial,
} from "./incorporaciones-service";

const incorporacionDirecta = (estado: "TEMP_CREDENTIAL" | "ACTIVE" | "CANCELLED" | "EXPIRED" = "TEMP_CREDENTIAL") => ({
  empresaId: "empresa-a",
  mecanismo: "DIRECTA",
  estado,
  uid: "uid-directo",
  codigo: "caja-01",
  rol: "cajero",
  permisosEfectivos: ["sell", "turnos"],
});

const credencialTemporal = (requiereCambio = true) => ({
  empresaId: "empresa-a",
  uid: "uid-directo",
  codigo: "caja-01",
  pinHash: "hash-temporal",
  activo: true,
  requiereCambio,
});

const membresiaActiva = () => ({
  empresaId: "empresa-a",
  uid: "uid-directo",
  rol: "cajero",
  permisos: ["sell", "turnos"],
  estado: "activa",
  activo: true,
});

test("la creacion DIRECTA inicia con credencial temporal valida", () => {
  const solicitud = prepararIncorporacionDirecta({
    nombre: "  Ana Operativa ",
    codigo: " Caja-01 ",
    pinTemporal: "123456",
    rol: "cajero",
  });

  assert.deepEqual(solicitud, {
    nombre: "Ana Operativa",
    codigo: "caja-01",
    pinTemporal: "123456",
    rol: "cajero",
  });
  assert.equal(validarEstadoInicial("DIRECTA", "TEMP_CREDENTIAL"), true);
  assert.equal(validarEstadoInicial("DIRECTA", "INVITED"), false);
});

test("la creacion EMAIL inicia invitada y normaliza el correo", () => {
  const solicitud = prepararIncorporacionEmail({
    email: " Admin@Cafe.test ",
    rol: "admin",
  });

  assert.deepEqual(solicitud, { email: "admin@cafe.test", rol: "admin" });
  assert.equal(validarEstadoInicial("EMAIL", "INVITED"), true);
  assert.equal(validarEstadoInicial("EMAIL", "TEMP_CREDENTIAL"), false);
});

test("DIRECTA restringe la asociacion de UIDs existentes hasta contar con prueba de posesion", () => {
  assert.throws(
    () => prepararIncorporacionDirecta({
      nombre: "Ana Existente",
      codigo: "caja-02",
      pinTemporal: "654321",
      rol: "cajero",
      uid: "uid-existente",
    }),
    { code: "invalid-argument" },
  );
});

test("DIRECTA reutiliza la misma clave de incorporacion y principal en reintentos", () => {
  const primera = idIncorporacionDirecta("empresa-a", "caja-01");
  assert.equal(primera, idIncorporacionDirecta("empresa-a", "caja-01"));
  assert.notEqual(primera, idIncorporacionDirecta("empresa-b", "caja-01"));
  assert.notEqual(primera, idIncorporacionDirecta("empresa-a", "caja-02"));
});

test("EMAIL usa una referencia determinista por tenant y email", () => {
  const primera = idIncorporacionEmail("empresa-a", "admin@cafe.test");
  assert.equal(primera, idIncorporacionEmail("empresa-a", "admin@cafe.test"));
  assert.notEqual(primera, idIncorporacionEmail("empresa-b", "admin@cafe.test"));
  assert.notEqual(primera, idIncorporacionEmail("empresa-a", "otro@cafe.test"));
  assert.equal(
    esIncorporacionEmailReutilizable({ mecanismo: "EMAIL", email: "admin@cafe.test", estado: "INVITED", rol: "admin" }, "admin@cafe.test", "admin"),
    true,
  );
  assert.equal(
    esIncorporacionEmailReutilizable({ mecanismo: "EMAIL", email: "admin@cafe.test", estado: "ACTIVE", rol: "admin" }, "admin@cafe.test", "admin"),
    false,
  );
});

test("EMAIL separa generaciones terminales sin perder aislamiento tenant", () => {
  assert.notEqual(
    idIncorporacionEmail("empresa-a", "ana@cafe.test", 1),
    idIncorporacionEmail("empresa-a", "ana@cafe.test", 2),
  );
  assert.notEqual(
    idIncorporacionEmail("empresa-a", "ana@cafe.test", 1),
    idIncorporacionEmail("empresa-b", "ana@cafe.test", 1),
  );
});

test("EMAIL usa HMAC estable sin persistir el secreto de invitacion", () => {
  const digest = digestTokenEmail("token-secreto", "pepper-email");
  assert.equal(digest, digestTokenEmail("token-secreto", "pepper-email"));
  assert.notEqual(digest, digestTokenEmail("token-secreto-2", "pepper-email"));
  assert.equal(digest.length, 64);
  assert.equal(EMAIL_INVITATION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test("EMAIL limita reenvios y aplica cooldown", () => {
  const ahora = new Date("2026-07-21T12:00:00.000Z");
  const invitacion = {
    estado: "INVITED",
    expiraEn: { toDate: () => new Date(ahora.getTime() + EMAIL_INVITATION_TTL_MS) },
    tokenVersion: 1,
    reenvios: 0,
  };
  assert.deepEqual(planificarReenvioEmail(invitacion, ahora), { tokenVersion: 2, reenvios: 1 });
  assert.throws(
    () => planificarReenvioEmail({ ...invitacion, ultimoReenvioEn: { toDate: () => new Date(ahora.getTime() - EMAIL_INVITATION_RESEND_COOLDOWN_MS + 1) } }, ahora),
    { code: "resource-exhausted" },
  );
  assert.throws(
    () => planificarReenvioEmail({ ...invitacion, reenvios: EMAIL_INVITATION_MAX_RESENDS }, ahora),
    { code: "resource-exhausted" },
  );
});

test("la autorizacion tenant deriva la empresa exclusivamente del claim admin", () => {
  assert.equal(
    extraerEmpresaIdTenant({ auth: { token: { rol: "admin", empresaId: "empresa-b" } } }),
    "empresa-b",
  );
  assert.throws(
    () => extraerEmpresaIdTenant({ auth: { token: { rol: "cajero", empresaId: "empresa-b" } } }),
    { code: "permission-denied" },
  );
  assert.throws(
    () => extraerEmpresaIdTenant({ auth: { token: { rol: "admin" } } }),
    { code: "permission-denied" },
  );
});

test("la incorporacion DIRECTA conserva el codigo aislado por tenant", () => {
  assert.notEqual(
    idIncorporacionDirecta("empresa-fundacional", "caja-01"),
    idIncorporacionDirecta("empresa-b", "caja-01"),
  );
});

test("las creaciones rechazan roles, emails y secretos temporales invalidos", () => {
  assert.throws(
    () => prepararIncorporacionDirecta({ nombre: "Ana", codigo: "caja", pinTemporal: "12345", rol: "admin" }),
    { code: "invalid-argument" },
  );
  assert.throws(
    () => prepararIncorporacionEmail({ email: "no-es-email", rol: "owner" }),
    { code: "invalid-argument" },
  );
});

test("la activacion exitosa planifica el cambio de PIN y copia permisos efectivos", () => {
  assert.deepEqual(
    planificarActivacionDirecta({
      incorporacion: incorporacionDirecta(),
      credencial: credencialTemporal(),
      uid: "uid-directo",
      empresaId: "empresa-a",
    }),
    {
      empresaId: "empresa-a",
      uid: "uid-directo",
      rol: "cajero",
      permisosEfectivos: ["sell", "turnos"],
      tipo: "ACTIVAR",
    },
  );
  assert.deepEqual(prepararActivacionDirecta({ pinActual: "123456", pinNuevo: "654321" }), {
    pinActual: "123456",
    pinNuevo: "654321",
  });
});

test("un reintento o doble activacion sobre ACTIVE es idempotente", () => {
  const plan = planificarActivacionDirecta({
    incorporacion: incorporacionDirecta("ACTIVE"),
    credencial: { ...credencialTemporal(false), pinHash: "hash-definitivo" },
    membresia: membresiaActiva(),
    uid: "uid-directo",
    empresaId: "empresa-a",
  });
  assert.equal(plan.tipo, "REINTENTO");
  assert.equal(
    idAuditoriaActivacion("incorporacion-1"),
    idAuditoriaActivacion("incorporacion-1"),
  );
  assert.notEqual(idAuditoriaActivacion("incorporacion-1"), idAuditoriaActivacion("incorporacion-2"));
});

test("una activacion rechaza PIN definitivo igual al temporal", () => {
  assert.throws(
    () => prepararActivacionDirecta({ pinActual: "123456", pinNuevo: "123456" }),
    { code: "invalid-argument" },
  );
});

test("una incorporacion CANCELLED o EXPIRED no puede activarse", () => {
  for (const estado of ["CANCELLED", "EXPIRED"] as const) {
    assert.throws(
      () => planificarActivacionDirecta({
        incorporacion: incorporacionDirecta(estado),
        credencial: credencialTemporal(),
        uid: "uid-directo",
        empresaId: "empresa-a",
      }),
      { code: "failed-precondition" },
    );
  }
});

test("un fallo parcial ACTIVE sin membresia puede reintentarse sin duplicar identidad", () => {
  const plan = planificarActivacionDirecta({
    incorporacion: incorporacionDirecta("ACTIVE"),
    credencial: { ...credencialTemporal(false), pinHash: "hash-definitivo" },
    uid: "uid-directo",
    empresaId: "empresa-a",
  });
  assert.equal(plan.tipo, "REINTENTO");
  assert.deepEqual(plan.permisosEfectivos, ["sell", "turnos"]);
});

test("una membresia preexistente incompatible bloquea la activacion parcial", () => {
  assert.throws(
    () => planificarActivacionDirecta({
      incorporacion: incorporacionDirecta(),
      credencial: credencialTemporal(),
      membresia: { ...membresiaActiva(), rol: "admin" },
      uid: "uid-directo",
      empresaId: "empresa-a",
    }),
    { code: "already-exists" },
  );
});
