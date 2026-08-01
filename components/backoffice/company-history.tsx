'use client'

import { AggregateHistory } from "./aggregate-history";

/** Historial de plataforma de una Empresa — ver `AggregateHistory`. */
export function CompanyHistory({ empresaId }: { empresaId: string }) {
  return <AggregateHistory tipoAgregado="EMPRESA" valor={empresaId} vacioDescripcion="Aún no existe evidencia de plataforma para esta empresa." />;
}
