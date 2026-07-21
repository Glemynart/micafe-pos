import { logger } from "firebase-functions";

export interface EntregaInvitacionEmail {
  incorporacionId: string;
  empresaId: string;
  email: string;
  token: string;
  tokenVersion: number;
  expiraEn: Date;
}

/** Puerto de entrega. Bloque 2.2 no integra proveedor ni envía correo real. */
export interface ProveedorEntregaInvitacionEmail {
  entregar(invitacion: EntregaInvitacionEmail): Promise<void>;
}

export const proveedorEntregaPendiente: ProveedorEntregaInvitacionEmail = {
  async entregar(invitacion) {
    logger.info("email_invitation_delivery_pending", {
      incorporacionId: invitacion.incorporacionId,
      empresaId: invitacion.empresaId,
      tokenVersion: invitacion.tokenVersion,
    });
  },
};
