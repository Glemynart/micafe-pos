import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { ejecutarAutenticacionOperativa } from "../../functions/src/operational-auth-executor";

if (!getApps().length) initializeApp();

const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

export const autenticarOperativo = onCall(
  { region: "us-central1", secrets: [PIN_PEPPER] },
  async (request) => ejecutarAutenticacionOperativa(request.data, {
    db: getFirestore(),
    auth: getAuth(),
    pepper: PIN_PEPPER.value(),
  }),
);
