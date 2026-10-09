import assert from "node:assert/strict";
import test from "node:test";
import { agruparCuadresCajaPorCajero } from "../reportes-caja";

test("el cuadre compara efectivo contado con el esperado del cierre, incluida la base", () => {
  const cuadros = agruparCuadresCajaPorCajero([
    {
      cajeroId: "vendedor-1",
      estado: "cerrado",
      baseApertura: 1_000,
      ventasEfectivo: 5_000,
      totalEsperadoEfectivo: 6_000,
      totalReportadoEfectivo: 6_000,
    },
  ]);

  assert.deepEqual(cuadros.get("vendedor-1"), {
    efectivoEsperado: 6_000,
    efectivoDeclarado: 6_000,
    diferenciaCaja: 0,
  });
});

test("el cuadre agrega cierres del mismo cajero y conserva faltantes/sobrantes netos", () => {
  const cuadros = agruparCuadresCajaPorCajero([
    {
      cajeroId: "vendedor-1",
      estado: "cerrado",
      totalEsperadoEfectivo: 10_000,
      totalReportadoEfectivo: 9_500,
    },
    {
      cajeroId: "vendedor-1",
      estado: "cerrado",
      totalEsperadoEfectivo: 4_000,
      totalReportadoEfectivo: 4_200,
    },
  ]);

  assert.deepEqual(cuadros.get("vendedor-1"), {
    efectivoEsperado: 14_000,
    efectivoDeclarado: 13_700,
    diferenciaCaja: -300,
  });
});

test("omite turnos abiertos y cierres sin importes canónicos", () => {
  const cuadros = agruparCuadresCajaPorCajero([
    {
      cajeroId: "vendedor-1",
      estado: "abierto",
      baseApertura: 10_000,
      totalReportadoEfectivo: 0,
    },
    {
      cajeroId: "vendedor-2",
      estado: "cerrado",
      totalReportadoEfectivo: 8_000,
    },
    {
      cajeroId: "vendedor-3",
      estado: "cerrado",
      totalEsperadoEfectivo: -1,
      totalReportadoEfectivo: 0,
    },
  ]);

  assert.equal(cuadros.size, 0);
});
