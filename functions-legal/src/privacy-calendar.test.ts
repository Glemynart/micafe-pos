import assert from "node:assert/strict";
import test from "node:test";
import { fechaBogota, sumarHabiles } from "../../functions/src/legal/privacy-calendar";

test("calendario colombiano omite fines de semana, festivos fijos y trasladados", () => {
  assert.equal(fechaBogota(Date.parse("2026-12-08T02:00:00Z")), "2026-12-07");
  assert.equal(sumarHabiles("2026-12-04", 2), "2026-12-09");
  assert.equal(sumarHabiles("2026-11-13", 1), "2026-11-17");
  assert.equal(sumarHabiles("2026-12-31", 1), "2027-01-04");
  assert.equal(sumarHabiles("2027-01-08", 1), "2027-01-12");
  assert.throws(() => sumarHabiles("2026-02-30", 2), /PLAZO_INVALIDO/);
});

test("Semana Santa, Ascensión, Corpus Christi y Sagrado Corazón se aplican en 2026", () => {
  assert.equal(sumarHabiles("2026-04-01", 1), "2026-04-06");
  assert.equal(sumarHabiles("2026-05-15", 1), "2026-05-19");
  assert.equal(sumarHabiles("2026-06-05", 1), "2026-06-09");
  assert.equal(sumarHabiles("2026-06-12", 1), "2026-06-16");
});
