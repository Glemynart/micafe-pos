# G-SAAS-02 — Preflight read-only de transición — 2026-08-13

## Resultado

El preflight reproducible se ejecutó contra el proyecto Firebase `micafe-pos` y
el tenant `1ae0rD9H8t3ZFSBKrrHR` el `2026-08-13T19:40:14Z`. La ejecución solo
realizó lecturas `GET` de Firestore REST; no invocó callables y no escribió en
producción.

```text
status: ESPERAR_VENTANA
readyForCanonicalCommands: false
readOnly: true
productionWrites: false
commandExecutionAllowed: false
```

## Evidencia positiva

- Proyecto `micafe-pos` y tenant Café Atrato, CO, confirmados.
- Suscripción raíz mensual intacta: v1, Trial `2026-08-03`–`2026-09-02`, sin snapshot.
- Plan anual v2 publicado: `ANUAL`, `1.800.000 COP`, nueve capacidades.
- Configuración histórica conserva siete módulos; no se adelantó `shifts` ni `cuentas_cobro`.
- No existe relación contractual anual previa.
- Operador activo con `COMERCIAL_GOBERNAR` y `LIFECYCLE_GOBERNAR`.
- SHA de aplicación declarado: `91e75b6e34e9892e3227a808ccd02c75408d74ef`.
- Hash de Functions observado: `ce73f42fa704c461257e87a809f45a264a7cbfc3`.

## Gaps que mantienen el preflight no ejecutable

- La ventana histórica no ha terminado; está protegida hasta `2026-09-02`.
- Falta referencia verificable de recovery.
- La ejecución no recibió atestaciones independientes de Rules, Storage y
  Vercel; por seguridad el release queda incompleto aunque SHA/CI/Functions
  estén identificados.

El resultado no autoriza `suspenderTrialVencido`,
`CrearRelacionContractualTrial`, `TransicionarEmpresa` ni la actualización de
configuración. La siguiente ejecución debe conservar la raíz histórica y usar
la misma salida JSON como evidencia del gate.

## Comando reproducible

El runner es `scripts/g-saas-02/trial-transition-preflight.ts` y el núcleo
testeable es `scripts/g-saas-02/trial-transition-preflight-core.ts`. Requiere
`FIREBASE_ACCESS_TOKEN` entregado fuera del repositorio y nunca obtiene ni
imprime credenciales.

## Revalidación posterior al merge

Tras los merges de #269 y #270, se ejecutó nuevamente el runner el
`2026-08-13T20:33:51Z`, declarando `main @ cc023b0fe987eb5f1dd556f882c2ce8293013c1b`.
La lectura volvió a confirmar:

```text
status: ESPERAR_VENTANA
readyForCanonicalCommands: false
readOnly: true
productionWrites: false
commandExecutionAllowed: false
```

Los gates positivos fueron identidad del proyecto/tenant, raíz histórica
intacta, Plan anual publicado, configuración histórica de siete módulos,
operador autorizado y cero relaciones anuales. Continúan pendientes la fecha
`2026-09-02`, recovery verificable y atestaciones independientes de release;
por tanto no se autoriza ninguna operación comercial productiva.

El PR #271 solo reconcilió esta evidencia y el Goal después del merge; no
cambió código ejecutable ni el estado productivo. La autoridad documental
posterior quedó integrada en `main @ 6e1cb04431e8d8c788c0d380d463d8f5eafebeb3`.
