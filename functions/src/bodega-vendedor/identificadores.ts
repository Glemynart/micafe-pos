/**
 * IDs de catálogo generados por crearIdentificadorInterno pueden superar el
 * límite histórico de 160 caracteres. Se mantiene un límite explícito y
 * acotado para referencias de producto/presentación, por debajo del límite de
 * 1.500 bytes de un ID de documento de Firestore.
 */
export const MAX_BODEGA_REFERENCE_ID_LENGTH = 1024;
