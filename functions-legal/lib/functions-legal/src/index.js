"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aceptarDocumentosLegalesTenant = exports.consultarEstadoLegalTenant = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const handler_1 = require("../../functions/src/legal/handler");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
exports.consultarEstadoLegalTenant = (0, https_1.onCall)({ region: "us-central1", invoker: "public" }, async (request) => (0, handler_1.consultarEstadoLegalTenant)(request));
exports.aceptarDocumentosLegalesTenant = (0, https_1.onCall)({ region: "us-central1", invoker: "public" }, async (request) => (0, handler_1.aceptarDocumentosLegalesTenant)(request));
