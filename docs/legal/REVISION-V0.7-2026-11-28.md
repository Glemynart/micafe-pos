# Revisión documental v0.7 — 2026-11-28

Estado: **BORRADOR / PREPARACIÓN. No está vigente ni es exigible. No es un concepto jurídico.**

## Cambios de este corte

- Se conserva `public/legal/v0.6/` sin modificación: los cuatro assets v0.6 ya habían sido servidos en staging y sus hashes constan en la evidencia histórica.
- Se crea `dusema-pos-2026-11-v0.7` con cuatro documentos versionados y sus SHA-256 UTF-8/LF. Una prueba automatizada comprueba igualdad entre `docs/legal`, `public/legal/v0.7` y el catálogo de hashes.
- Los términos declaran la limitación real del POS: no verifica la edad del comprador ni bloquea ventas de bebidas alcohólicas. También dicen que registrar una transacción no demuestra que el vendedor verificó la edad.
- La obligación descrita se cotejó en fuentes oficiales: [Ley 124 de 1994, art. 1](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=291), [Decreto 120 de 2010](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=38680) y [Ley 1801 de 2016, art. 38](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=80538).
- Política, aviso y anexo no cambian materialmente frente al contenido v0.6; sus cabeceras/versiones se actualizan para que las cuatro piezas compartan la versión del bundle. Los objetivos de conservación siguen sin activarse y no se presentan como plazos legales universales.

## Validaciones técnicas

- `npm run test:legal-bundle`: pasa y verifica que fuente, asset y hash coinciden.
- `npx tsc --noEmit`: termina correctamente.
- `npm run build`: termina correctamente y genera las cuatro rutas públicas legales.
- `npm run e2e:privacy:staging`: 2/2 escenarios sintéticos de Backoffice pasan, con aislamiento, autorización negativa y limpieza comprobada. Ese smoke usa el build de staging anterior y no valida la publicación de v0.7.

## Estado de aprobación y publicación

El bundle continúa `PREPARACION`; términos, política, aviso y anexo siguen en
`BORRADOR`. La vista de staging observada aún sirve el build con rutas públicas
v0.6; v0.7 no está publicado. Producción sigue con el contenido heredado en
`/terminos` y devuelve 404 para las otras tres rutas. No se desplegó ni se
habilitó la aceptación legal real.

No se presenta la validación de ingeniería ni las fuentes normativas como
aprobación jurídica profesional. Faltan cierre factual y aprobación jurídica,
proveedores/canales verificados, decisión de ADR-SAAS-109, autorización y canal
de exportación, certificación de supresión/conservación real, IAM productivo y
revisión humana del PR #706.
