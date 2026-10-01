import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  emitirCredencialInicial as emitirCredencialInicialNeutral,
  type ParametrosEmitirCredencialInicial as ParametrosNeutral,
  type ResolverPrincipal,
} from "../credential-core/emitir-credencial-inicial";

export {
  TTL_CREDENCIAL_INICIAL_MS,
  type AuditObserverCredencialInicial,
  type CredencialInicialEmitida,
  type ResolverPrincipal,
  type ValidadorTransaccionalEmisionCredencialInicial,
} from "../credential-core/emitir-credencial-inicial";

/** Conserva el contrato legacy mientras los adaptadores migran al núcleo neutral. */
export type ParametrosEmitirCredencialInicial = Omit<ParametrosNeutral, "resolverPrincipal"> & {
  resolverPrincipal?: ResolverPrincipal;
};

export async function emitirCredencialInicial(
  db: Firestore,
  params: ParametrosEmitirCredencialInicial,
) {
  return emitirCredencialInicialNeutral(db, {
    ...params,
    resolverPrincipal: params.resolverPrincipal ?? ((uid) => getAuth().getUser(uid)),
  });
}
