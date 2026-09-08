// ADR-SAAS-041: entrypoint dedicado y secret-free para el binding Dusema.
// El build incluye solamente el cierre de imports de esta autoridad.
export { crearBindingDusemaStagingSaas } from "../../functions/src/platform/dusema-binding-callable";
