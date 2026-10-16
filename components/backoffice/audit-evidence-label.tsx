import { Badge } from "@/components/ui/badge";
import type { ProyeccionEvidenciaAuditoria } from "@/lib/platform/audit-evidence-types";

export function AuditEvidenceLabel({ item }: { item: ProyeccionEvidenciaAuditoria }) {
  if (item.compatibilidadSchemaVersion !== "SOPORTADA") {
    const noSoportada = item.compatibilidadSchemaVersion === "NO_SOPORTADA";
    return (
      <div role="status" className="space-y-1">
        <Badge variant="destructive">{noSoportada ? "Versión de evidencia no soportada" : "Evidencia inválida"}</Badge>
        <p className="text-xs text-slate-500">
          Tipo recibido: {item.tipo ?? "desconocido"}
          {typeof item.schemaVersion === "number" ? ` (schema v${item.schemaVersion})` : ""}
        </p>
        {item.diagnosticoCompatibilidad && <p className="text-xs text-slate-500">Diagnóstico: {item.diagnosticoCompatibilidad}</p>}
        {item.detalleDiagnostico && <p className="text-xs text-slate-500">Campos de detalle: {item.detalleDiagnostico.campos.join(", ") || "ninguno"}</p>}
      </div>
    );
  }
  return <strong className="text-xs">{item.tipo ?? "Evidencia"}</strong>;
}
