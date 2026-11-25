import assert from "node:assert/strict";
import test from "node:test";
import {
  ajustarAlSiguienteHabil, fechaBogota, PRIVACY_CALENDAR_V1, PRIVACY_CALENDAR_V2,
  sumarHabiles, sumarMesesCalendario, vencimientoDosMeses,
} from "../../functions/src/legal/privacy-calendar";

test("calendario colombiano omite fines de semana, festivos fijos y trasladados", () => {
  assert.equal(fechaBogota(Date.parse("2026-12-08T02:00:00Z")), "2026-12-07");
  assert.equal(sumarHabiles("2026-12-04", 2, PRIVACY_CALENDAR_V1), "2026-12-09");
  assert.equal(sumarHabiles("2026-11-13", 1, PRIVACY_CALENDAR_V1), "2026-11-17");
  assert.equal(sumarHabiles("2026-12-31", 1, PRIVACY_CALENDAR_V1), "2027-01-04");
  assert.equal(sumarHabiles("2027-01-08", 1, PRIVACY_CALENDAR_V1), "2027-01-12");
  assert.throws(() => sumarHabiles("2026-02-30", 2, PRIVACY_CALENDAR_V1), /PLAZO_INVALIDO/);
});

test("Semana Santa, Ascensión, Corpus Christi y Sagrado Corazón se aplican en 2026", () => {
  assert.equal(sumarHabiles("2026-04-01", 1, PRIVACY_CALENDAR_V1), "2026-04-06");
  assert.equal(sumarHabiles("2026-05-15", 1, PRIVACY_CALENDAR_V1), "2026-05-19");
  assert.equal(sumarHabiles("2026-06-05", 1, PRIVACY_CALENDAR_V1), "2026-06-09");
  assert.equal(sumarHabiles("2026-06-12", 1, PRIVACY_CALENDAR_V1), "2026-06-16");
});

test("el calendario V2 cuenta sábados y conserva V1 para expedientes históricos", () => {
  assert.equal(sumarHabiles("2026-11-27", 1, PRIVACY_CALENDAR_V2), "2026-11-28");
  assert.equal(sumarHabiles("2026-11-27", 1, PRIVACY_CALENDAR_V1), "2026-11-30");
  assert.equal(sumarHabiles("2026-12-04", 2, PRIVACY_CALENDAR_V2), "2026-12-07");
});

test("plazos en meses usan calendario y extienden domingos/festivos", () => {
  assert.equal(sumarMesesCalendario("2026-01-31", 1), "2026-02-28");
  assert.equal(vencimientoDosMeses("2026-10-06", PRIVACY_CALENDAR_V2), "2026-12-07");
  assert.equal(ajustarAlSiguienteHabil("2026-12-25", PRIVACY_CALENDAR_V2), "2026-12-26");
});
