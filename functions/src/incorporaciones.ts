import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { exigirAdminTenant } from "./operational-auth";
import { proveedorEntregaPendiente } from "./email-invitation-delivery";
import {
  aceptarIncorporacionEmail as aceptarIncorporacionEmailServicio,
  activarIncorporacionDirecta as activarIncorporacionDirectaServicio,
  cancelarIncorporacionEmail as cancelarIncorporacionEmailServicio,
  crearIncorporacionDirecta as crearIncorporacionDirectaServicio,
  crearIncorporacionEmail as crearIncorporacionEmailServicio,
  reenviarIncorporacionEmail as reenviarIncorporacionEmailServicio,
  type SolicitudActivacionDirecta,
  type SolicitudAceptacionEmail,
  type SolicitudCancelacionEmail,
  type SolicitudIncorporacionDirecta,
  type SolicitudIncorporacionEmail,
  type SolicitudReenvioEmail,
} from "./incorporaciones-service";

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const EMAIL_INVITATION_TOKEN_PEPPER = defineSecret("EMAIL_INVITATION_TOKEN_PEPPER");

function obtenerPepper(): string {
  const pepper = PIN_PEPPER.value();
  if (!pepper) throw new HttpsError("internal", "No fue posible crear la incorporacion.");
  return pepper;
}

function obtenerPepperEmail(): string {
  const pepper = EMAIL_INVITATION_TOKEN_PEPPER.value();
  if (!pepper) throw new HttpsError("internal", "No fue posible procesar la incorporacion por email.");
  return pepper;
}

export const crearIncorporacionDirecta = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request) => {
    const empresa = await exigirAdminTenant(request);
    return crearIncorporacionDirectaServicio({
      empresaId: empresa.id,
      emisorUid: request.auth!.uid,
      data: request.data as SolicitudIncorporacionDirecta | undefined,
      pepper: obtenerPepper(),
    });
  }
);

export const activarIncorporacionDirecta = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
  async (request) => {
    if (!request.auth || request.auth.token.authStage !== "DIRECTA_TEMP"
      || typeof request.auth.token.incorporacionId !== "string") {
      throw new HttpsError("permission-denied", "Acceso denegado.");
    }
    return activarIncorporacionDirectaServicio({
      incorporacionId: request.auth.token.incorporacionId,
      uid: request.auth.uid,
      data: request.data as SolicitudActivacionDirecta | undefined,
      pepper: obtenerPepper(),
    });
  }
);

export const crearIncorporacionEmail = onCall(
  { region: REGION, secrets: [EMAIL_INVITATION_TOKEN_PEPPER] },
  async (request) => {
    const empresa = await exigirAdminTenant(request);
    const resultado = await crearIncorporacionEmailServicio({
      empresaId: empresa.id,
      emisorUid: request.auth!.uid,
      data: request.data as SolicitudIncorporacionEmail | undefined,
      tokenSecret: obtenerPepperEmail(),
    });
    if (resultado.entrega) await proveedorEntregaPendiente.entregar({ ...resultado.entrega, incorporacionId: resultado.incorporacionId, empresaId: empresa.id });
    return { incorporacionId: resultado.incorporacionId, estado: resultado.estado };
  }
);

export const reenviarIncorporacionEmail = onCall(
  { region: REGION, secrets: [EMAIL_INVITATION_TOKEN_PEPPER] },
  async (request) => {
    const empresa = await exigirAdminTenant(request);
    const incorporacionId = (request.data as SolicitudReenvioEmail | undefined)?.incorporacionId;
    if (typeof incorporacionId !== "string" || !incorporacionId) throw new HttpsError("invalid-argument", "Incorporacion invalida.");
    const resultado = await reenviarIncorporacionEmailServicio({ incorporacionId, empresaId: empresa.id, emisorUid: request.auth!.uid, tokenSecret: obtenerPepperEmail() });
    await proveedorEntregaPendiente.entregar({ ...resultado.entrega, incorporacionId, empresaId: empresa.id });
    return { incorporacionId, estado: "INVITED", tokenVersion: resultado.entrega.tokenVersion };
  }
);

export const cancelarIncorporacionEmail = onCall(
  { region: REGION },
  async (request) => {
    const empresa = await exigirAdminTenant(request);
    const incorporacionId = (request.data as SolicitudCancelacionEmail | undefined)?.incorporacionId;
    if (typeof incorporacionId !== "string" || !incorporacionId) throw new HttpsError("invalid-argument", "Incorporacion invalida.");
    return cancelarIncorporacionEmailServicio({ incorporacionId, empresaId: empresa.id, emisorUid: request.auth!.uid });
  }
);

export const aceptarIncorporacionEmail = onCall(
  { region: REGION, secrets: [EMAIL_INVITATION_TOKEN_PEPPER] },
  async (request) => {
    const data = request.data as SolicitudAceptacionEmail | undefined;
    if (typeof data?.incorporacionId !== "string" || typeof data.token !== "string") throw new HttpsError("invalid-argument", "Incorporacion invalida.");
    return aceptarIncorporacionEmailServicio({
      incorporacionId: data.incorporacionId,
      token: data.token,
      password: data.password,
      uid: request.auth?.uid,
      emailSesion: request.auth?.token.email,
      tokenSecret: obtenerPepperEmail(),
    });
  }
);
