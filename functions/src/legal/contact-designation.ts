export const EXPORT_CONTACT_DESIGNATION_COLLECTION = "saas_export_contact_designations";

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const refPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const validDate = (value: unknown): value is string => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validDestination = (channel: unknown, value: unknown): value is string => typeof value === "string"
  && value.trim().length >= 3 && value.length <= 320 && !/[\r\n\u0000-\u001f]/.test(value)
  && (channel === "EMAIL_VERIFICADO"
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    : channel === "WHATSAPP_VERIFICADO" && /^\+[1-9]\d{7,14}$/.test(value));

export type DesignacionContactoActiva = {
  schemaVersion: 1;
  projectId: string;
  empresaId: string;
  revision: number;
  estado: "PENDIENTE_CANAL" | "ACTIVO" | "REVOCADO";
  canalVerificadoEn?: string;
  contacto: {
    id: string;
    canal: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO";
    destino: string | null;
    referenciaDesignacion: string;
    designadoEn: string;
    verificadoPorUid: string;
  };
};

export function validarDesignacionContactoActiva(
  value: unknown,
  input: { projectId: string; empresaId: string; contactId: string; channel: string; designationRef: string; designationAt: string; designationVersion: number },
): value is DesignacionContactoActiva {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as DesignacionContactoActiva;
  return record.schemaVersion === 1 && record.projectId === input.projectId && record.empresaId === input.empresaId
    && record.estado === "ACTIVO" && record.revision === input.designationVersion
    && record.contacto?.id === input.contactId && record.contacto.canal === input.channel
    && record.contacto.referenciaDesignacion === input.designationRef && record.contacto.designadoEn === input.designationAt
    && refPattern.test(record.contacto.referenciaDesignacion) && validDate(record.contacto.designadoEn)
    && idPattern.test(record.contacto.verificadoPorUid)
    && validDestination(record.contacto.canal, record.contacto.destino)
    && validDate(record.canalVerificadoEn);
}

export function validarDesignacionContactoPendiente(
  value: unknown,
  input: { projectId: string; empresaId: string; contactId: string; channel: string; designationRef: string; designationVersion: number },
): value is DesignacionContactoActiva {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as DesignacionContactoActiva;
  return record.schemaVersion === 1 && record.projectId === input.projectId && record.empresaId === input.empresaId
    && record.estado === "PENDIENTE_CANAL" && record.revision === input.designationVersion
    && record.contacto?.id === input.contactId && record.contacto.canal === input.channel
    && record.contacto.referenciaDesignacion === input.designationRef && refPattern.test(record.contacto.referenciaDesignacion)
    && validDate(record.contacto.designadoEn) && idPattern.test(record.contacto.verificadoPorUid)
    && validDestination(record.contacto.canal, record.contacto.destino);
}

export type ContactDesignationRepository = ReturnType<typeof createFirestoreContactDesignationRepository>;

/** Server-only source for contact designation. Callers must separately authorize platform operators. */
export function createFirestoreContactDesignationRepository({ db, serverTimestamp }: { db: any; serverTimestamp: () => unknown }) {
  if (!db || typeof db.runTransaction !== "function" || typeof serverTimestamp !== "function") {
    throw new Error("CONTACT_DESIGNATION_STORE_NOT_CONFIGURED");
  }
  const tenantRef = (empresaId: string) => db.collection("empresas").doc(empresaId);
  const rootRef = (empresaId: string) => db.collection(EXPORT_CONTACT_DESIGNATION_COLLECTION).doc(empresaId);
  const eventRef = (empresaId: string, version: number) => rootRef(empresaId).collection("events").doc(`designation-${String(version).padStart(6, "0")}`);

  return Object.freeze({
    async propose(input: {
      projectId: string; empresaId: string; operatorUid: string; contactId: string;
      channel: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO"; destination: string;
      designationRef: string; designationAt: string; confirmedInstruction: true;
    }, authorize?: (tx: any) => Promise<void>): Promise<number | null> {
      if (!idPattern.test(input.projectId) || !idPattern.test(input.empresaId) || !idPattern.test(input.operatorUid)
        || !idPattern.test(input.contactId) || !["EMAIL_VERIFICADO", "WHATSAPP_VERIFICADO"].includes(input.channel)
        || !validDestination(input.channel, input.destination) || !refPattern.test(input.designationRef)
        || !validDate(input.designationAt) || input.confirmedInstruction !== true) return null;
      try {
        return await db.runTransaction(async (tx: any) => {
          await authorize?.(tx);
          const tenant = await tx.get(tenantRef(input.empresaId));
          if (!tenant.exists) return null;
          const root = rootRef(input.empresaId);
          const snap = await tx.get(root);
          const current = snap.exists ? snap.data() : null;
          if (current && (current.projectId !== input.projectId || current.empresaId !== input.empresaId
            || !Number.isSafeInteger(current.revision) || current.revision < 0)) return null;
          const revision = (current?.revision ?? 0) + 1;
          const timestamp = serverTimestamp();
          const record: DesignacionContactoActiva = {
            schemaVersion: 1, projectId: input.projectId, empresaId: input.empresaId, revision,
            estado: "PENDIENTE_CANAL",
            contacto: {
              id: input.contactId, canal: input.channel, destino: input.destination,
              referenciaDesignacion: input.designationRef, designadoEn: input.designationAt,
              verificadoPorUid: input.operatorUid,
            },
          };
          tx.set(root, { ...record, actualizadoEn: timestamp });
          tx.create(eventRef(input.empresaId, revision), {
            schemaVersion: 1, tipo: "DESIGNACION_PROPUESTA", projectId: input.projectId,
            empresaId: input.empresaId, contactId: input.contactId, version: revision,
            referenciaDesignacion: input.designationRef, actorUid: input.operatorUid, creadoEn: timestamp,
          });
          return revision;
        });
      } catch { return null; }
    },

    async resolve(input: { projectId: string; empresaId: string; designationRef: string }, authorize?: (tx: any) => Promise<void>) {
      try {
        return await db.runTransaction(async (tx: any) => {
          await authorize?.(tx);
          const [tenant, snap] = await Promise.all([
            tx.get(tenantRef(input.empresaId)), tx.get(rootRef(input.empresaId)),
          ]);
          if (!tenant.exists) return null;
          if (!snap.exists) return null;
          const value = snap.data() as DesignacionContactoActiva;
          if (value.schemaVersion !== 1 || value.projectId !== input.projectId || value.empresaId !== input.empresaId
            || value.estado !== "PENDIENTE_CANAL" || !Number.isSafeInteger(value.revision) || value.revision < 1
            || !value.contacto || !idPattern.test(value.contacto.id) || value.contacto.referenciaDesignacion !== input.designationRef
            || !refPattern.test(value.contacto.referenciaDesignacion) || !validDate(value.contacto.designadoEn)
            || !idPattern.test(value.contacto.verificadoPorUid) || !validDestination(value.contacto.canal, value.contacto.destino)) return null;
          return {
            projectId: value.projectId, empresaId: value.empresaId, contactId: value.contacto.id,
            channel: value.contacto.canal, destination: value.contacto.destino,
            designationRef: value.contacto.referenciaDesignacion, designationAt: value.contacto.designadoEn,
            designationVersion: value.revision, designationVerified: true as const,
          };
        });
      } catch { return null; }
    },

    async readSummary(projectId: string, empresaId: string, authorize?: (tx: any) => Promise<void>) {
      try {
        return await db.runTransaction(async (tx: any) => {
          await authorize?.(tx);
          const [tenant, snap] = await Promise.all([
            tx.get(tenantRef(empresaId)), tx.get(rootRef(empresaId)),
          ]);
          if (!tenant.exists) return null;
          if (!snap.exists) return null;
          const value = snap.data() as DesignacionContactoActiva;
          if (value.schemaVersion !== 1 || value.projectId !== projectId || value.empresaId !== empresaId
            || !Number.isSafeInteger(value.revision) || value.revision < 1 || !value.contacto
            || !idPattern.test(value.contacto.id) || !["PENDIENTE_CANAL", "ACTIVO", "REVOCADO"].includes(value.estado)) return null;
          const destination = typeof value.contacto.destino === "string" ? value.contacto.destino : "";
          const maskedDestination = value.contacto.canal === "EMAIL_VERIFICADO"
            ? destination.replace(/^(.).*(@.*)$/, "$1•••$2")
            : destination.replace(/\d(?=\d{4})/g, "•");
          return {
            revision: value.revision, estado: value.estado, contactId: value.contacto.id,
            channel: value.contacto.canal, maskedDestination, designationRef: value.contacto.referenciaDesignacion,
            designatedAt: value.contacto.designadoEn,
          };
        });
      } catch { return null; }
    },

    async readDestination(input: { projectId: string; empresaId: string; contactId: string; designationVersion: number }) {
      try {
        const snap = await rootRef(input.empresaId).get();
        if (!snap.exists) return null;
        const value = snap.data() as DesignacionContactoActiva;
        return value.schemaVersion === 1 && value.projectId === input.projectId && value.empresaId === input.empresaId
          && value.estado === "ACTIVO" && value.revision === input.designationVersion
          && value.contacto?.id === input.contactId && validDestination(value.contacto.canal, value.contacto.destino)
          ? value.contacto.destino : null;
      } catch { return null; }
    },
  });
}
