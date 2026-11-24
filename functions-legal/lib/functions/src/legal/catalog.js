"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLE_LEGAL_ACTUAL = void 0;
/**
 * Huellas de los archivos publicados en public/legal/v0.2. Los cuatro textos
 * son borradores; el estado del bundle evita presentarlos como contrato vigente.
 */
exports.BUNDLE_LEGAL_ACTUAL = {
    id: "dusema-pos-2026-11-v0.2",
    estado: "PREPARACION",
    documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
    documentos: [
        { id: "terminos", titulo: "Términos del servicio", version: "0.2", sha256: "726665fca653b9eb1bb3d26771f961ff69c596e42472bcb51136b4c7fe709ff0", rutaPublica: "/legal/v0.2/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
        { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.2", sha256: "db97af46ffbf9da74c791c3a853353935505ad6112fb68f81a9ef0680cb5cfc7", rutaPublica: "/legal/v0.2/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
        { id: "aviso-autorizacion", titulo: "Aviso y autorización de datos", version: "0.2", sha256: "e5892ebce6e621058cb4b1c5bc7f3fa5766e790a90976b0cd119eb5e5433240a", rutaPublica: "/legal/v0.2/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
        { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.2", sha256: "5bec17a07ab0524b1390ce3f87c713ffcf8e8ad9f4a89587acaf9054e935696d", rutaPublica: "/legal/v0.2/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    ],
};
