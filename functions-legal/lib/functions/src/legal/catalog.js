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
        { id: "terminos", titulo: "Términos del servicio", version: "0.2", sha256: "b41288ae5042edc2571bed74607d67a5bd7077ec69f02a418216c49d51368974", rutaPublica: "/legal/v0.2/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
        { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.2", sha256: "08a120e93e4528f7e480267961249125901d6f72ea810e7603abd8e4d10943b4", rutaPublica: "/legal/v0.2/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
        { id: "aviso-autorizacion", titulo: "Aviso y autorización de datos", version: "0.2", sha256: "f2482c5d76b11447fb9af71697e52f046c3f1dca49f564285c729b3cf270c911", rutaPublica: "/legal/v0.2/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
        { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.2", sha256: "90d749dbf662a3041dcca1f64d45eb2c2deb10a3b76e4e0340b0092937cdb54b", rutaPublica: "/legal/v0.2/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    ],
};
