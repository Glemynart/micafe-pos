/**
 * drenar-pagina.ts — drenado de las escrituras encoladas de una página del
 * backfill operativo (MT-U3 Capa 5).
 *
 * POR QUÉ EXISTE
 * --------------
 * `BulkWriter` **bufferiza**: `update()` encola la escritura y devuelve una
 * promesa que solo se asienta cuando el lote correspondiente se envía de
 * verdad. El envío ocurre en tres situaciones: al llenarse un lote interno, al
 * llamar a `flush()`, o al llamar a `close()`.
 *
 * `migrate-mt-u3-operativo.ts` mantiene contrapresión por página: espera todas
 * las escrituras de una página antes de paginar a la siguiente, para acotar el
 * trabajo en vuelo (misma cadencia que la implementación previa con
 * `WriteBatch`). Esa espera se hacía con `await Promise.all(escriturasPagina)`
 * SIN drenar antes el búfer. Cuando el número de escrituras pendientes no
 * completaba un lote interno, nada se enviaba: las promesas nunca se asentaban,
 * el bucle de eventos se vaciaba y **Node terminaba con código 0, sin error ni
 * resumen**, dejando la migración a medias en silencio.
 *
 * Observado en producción el 2026-07-25: de 44 documentos huérfanos en
 * `ventas` se escribieron 40 (dos lotes auto-enviados) y los 4 restantes
 * quedaron en el búfer. Las reejecuciones posteriores, con solo 4 pendientes
 * — por debajo del umbral de auto-envío —, no escribieron absolutamente nada.
 *
 * POR QUÉ `flush()` Y NO `close()`
 * --------------------------------
 * Ambos vacían el búfer, pero `close()` es **terminal**: marca la instancia
 * como cerrada y cualquier método posterior lanza error. Usarlo por página
 * exigiría un `BulkWriter` por página, lo que contradice el diseño de uno por
 * colección y descarta en cada página el estado del limitador de tasa (arranca
 * en 500 ops/s y escala gradualmente) y el backoff acumulado.
 *
 * `flush()` es la primitiva reentrante que la propia API documenta para este
 * patrón: confirma lo encolado hasta ese punto, no espera lo añadido después, y
 * su documentación indica explícitamente volver a llamarlo si se quiere esperar
 * escrituras posteriores.
 *
 * POR QUÉ SE MANTIENE EL `Promise.all` DESPUÉS
 * --------------------------------------------
 * Los contadores del informe (`tocados`, `desaparecidos`, `erroresEscritura`)
 * se actualizan en el `.then`/`.catch` de cada promesa individual. Que
 * `flush()` resuelva no garantiza, por orden de microtareas, que esos callbacks
 * ya se hayan ejecutado. El `Promise.all` posterior sí lo garantiza y, sobre
 * promesas ya asentadas, tiene coste nulo. Sin él, el informe por colección
 * podría subcontar escrituras que sí ocurrieron.
 */

/**
 * Superficie mínima de `BulkWriter` que este helper necesita. Se tipa así (y no
 * con el `BulkWriter` del SDK) para poder sustituirlo por un doble en pruebas
 * sin depender de credenciales ni de red.
 */
export interface EscritorEnLote {
  flush(): Promise<void>
}

/**
 * Drena las escrituras encoladas de una página y espera a que todas se hayan
 * contabilizado.
 *
 * Es un no-op cuando la página no generó escrituras (dry-run, o página cuyos
 * documentos ya estaban todos estampados): en ese caso no se llama a `flush()`,
 * evitando un viaje de red innecesario por página.
 *
 * @param escritor `BulkWriter` de la colección, o `null` en dry-run.
 * @param escriturasPagina Promesas devueltas por `bulkWriter.update()`, cada
 *   una con sus propios `.then`/`.catch` ya adjuntos; por eso nunca rechazan y
 *   este helper no necesita capturar errores.
 */
export async function drenarPagina(
  escritor: EscritorEnLote | null,
  escriturasPagina: Promise<void>[],
): Promise<void> {
  if (escriturasPagina.length === 0) return
  if (escritor) await escritor.flush()
  await Promise.all(escriturasPagina)
}
