'use client'

import { AggregateHistory } from "./aggregate-history";

/** Historial de plataforma de una Suscripción — ver `AggregateHistory`. */
export function SubscriptionHistory({ empresaId }: { empresaId: string }) {
  return <AggregateHistory tipoAgregado="SUSCRIPCION" valor={empresaId} vacioDescripcion="Aún no existe evidencia de plataforma para esta suscripción." />;
}
