// Versioned allowlists. Unknown fields stop certification; no arbitrary raw dump.
export const SCHEMA_VERSION = 'DUSEMA_EXIT_V1';
export const scalar = 'scalar';
export const fields = (names) => Object.fromEntries(names.split(/\s+/).filter(Boolean).map(name => [name, scalar]));
export const recordOf = schema => ({ $record: schema });
const common = fields('id empresaId schemaVersion version revision catalogoId creadoEn creadaEn actualizadoEn actualizadaEn fecha estado activo espacioId');
const item = fields(`id productoId articuloId articuloTipo productoNombreSnapshot productoNombre nombre articuloNombre
  unidad unidadBase unidadBaseSnapshot presentacionId presentacionNombre presentacionNombreSnapshot cantidad
  cantidadPresentaciones factorUnidadBase cantidadUnidadBase precio precioUnitario precioUnitarioCOP
  precioPresentacionCOP precioBasePresentacionCOP precioBaseCOP subtotal subtotalCOP costo costoUnitario
  costoUnidadBaseCOP costoPresentacionCOP costoTotalLineaCOP costoTotalFIFOCOP ofertaId descuento impuesto`);
const layer = fields('capaId cantidad cantidadUnidadBase costoUnitarioCOP costoTotalCOP importeCOP movimientoId movimientoOrigenId secuenciaArticulo');
item.capasConsumidasDetalle = [layer];
const payment = fields('metodo montoRecibidoCOP cambioCOP montoCOP cuentaId');
const receipt = {
  ...fields('version empresaId nombreComercialSnapshot consecutivo folioInterno fechaConfirmacionIso subtotalCOP descuentoCOP totalCOP metodoPago montoRecibidoCOP cambioCOP'),
  cliente: fields('id nombre'), lineas: [item],
};
const modifier = { ...fields('grupoId nombreGrupo'), opcionIds: [scalar], opciones: [{ ...fields('opcionId nombre cocinaNombre'), precioDelta: scalar }] };
const salonItem = {
  ...fields('id uid name code price cost category emoji stock impuestoTipo iva impoconsumo hasRecipe quantity schemaVersion configurationKey precioBaseUnitario cantidadEnviada enviadoCocina'),
  modificadores: [modifier],
};
const pedidoMovement = {
  ...fields('tipo pedidoRelacionadoId mesaOrigenId mesaDestinoId nombreMesaOrigen nombreMesaDestino fecha cajeroId'),
  items: [{ ...fields('uid name'), quantity: scalar }],
};
const operationResultLine = fields('productoId productoNombre unidadBase presentacionId presentacionNombre cantidad factorUnidadBase cantidadUnidadBase canal precioFinalCOP');
const inventoryIncident = fields('tipo itemId itemNombre stockAnterior cantidadSolicitada');
const publicAgenda = {
  ...fields('programacionId estado revision clienteId fechaLocal zonaHoraria stockReservadoUnidadBase solicitanteUid solicitudId reservaExpiraEn creadaEn actualizadaEn'),
  cliente: fields('id nombre direccion'), franja: fields('desde hasta'), lineas: [operationResultLine],
};
const offerSnapshot = {
  ...fields('nombre inicioEnMillis finEnMillis'),
  lineas: [{ ...fields('presentacionId canal'), precioFinalCOP: scalar }],
};
const operationReferences = {
  ...fields(`commandId turnoId turnoRecaudoId turnoCompensacion cajeroId solicitanteUid estado estadoOperativo estadoReserva idempotente aplicado movimientoId movimientoFinancieroId compraId egresoId liquidacionId ventaId pedidoId pedidoOrigenId pedidoNuevoId pedidoDestinoId itemUid solicitudId programacionId reservaId categoriaId articuloTipo articuloId mermaId abonoId ofertaId presentacionId productoId clienteId catalogoId cuentaDocumentoId cuentaClaveOperativa metodoPago metodoPagoFinal relevoCajeroId relevoTurnoId ledgerHash fechaLocal zonaHoraria reservaExpiraEn fechaCompromisoPagoLocal creadaEn actualizadaEn
    efectivoEsperado diferenciaEfectivo depositoNeto revision saldoPendienteCOP totalAbonadoCOP total montoRecibidoCOP cambioCOP montoCOP stockReservadoUnidadBase items capasCreadas cargoAperturaCOP saldoControlCOP precioAplicadoCOP`),
  movimientos: [scalar], movimientosInventario: [scalar], cuentaControlMovimientoIds: [scalar], comandaIds: [scalar], pedidosOrigenIds: [scalar],
  incidenciasInventario: [inventoryIncident],
  lineas: [operationResultLine],
  franja: fields('desde hasta'),
  programaciones: [publicAgenda],
  cliente: fields('id nombre direccion'), reciboInterno: receipt,
  antes: offerSnapshot, despues: offerSnapshot,
};
const operationActor = fields('uid rolEfectivo');
const operationCommand = fields('id tipo idempotencyKey huella correlationId');
const operationIntent = fields('baseApertura notasApertura');
const adapter = (extra, nested = {}) => ({ ...common, ...fields(extra), ...nested });
const price = fields('importe moneda');
const snapshot = {
  ...fields('schemaVersion planId planVersion codigoPlan periodicidad trialDias ofertaComercialId referenciaAceptacionCliente'),
  precio: price, capacidades: [scalar], limites: {}, sedeConceptual: fields('cantidad'),
  fiscalidad: fields('pais modalidad habilitada'), vigencia: fields('inicio fin'),
};
const brandingAsset = fields('ubicacion versionContenido tipo');
const palette = fields('primary onPrimary secondary onSecondary accent onAccent surface onSurface background onBackground success onSuccess warning onWarning danger onDanger info onInfo');
const configuration = adapter('vertical', {
  identidadFiscal: { ...fields('nombreComercial razonSocial tipoPersona tipoDocumento numeroDocumento digitoVerificacion regimenTributario actividadEconomicaPrincipal'), responsabilidadesFiscales: [scalar], contacto: fields('email telefono') },
  localizacion: { ...fields('paisFiscal moneda idioma zonaHoraria'), direccion: fields('linea1 linea2 departamentoCodigo departamentoNombre municipioCodigo municipioNombre codigoPostal') },
  impuestos: fields('preciosIncluyenImpuestos impuestoTipoPredeterminado politicaRedondeo'),
  branding: { ...fields('modelVersion nombreVisible modoVisual'), assets: { logoPrincipal: brandingAsset, logoModoOscuro: brandingAsset, favicon: brandingAsset, iconoAplicacion: brandingAsset }, paletas: { light: palette, dark: palette } },
  ticket: fields('logoDocumentoUrl mensajePie mostrarLogoDocumento mostrarRazonSocial mostrarDireccion mostrarTelefono mostrarDesgloseImpuestos'),
  impresion: fields('formatoPapel copiasVenta copiasCierre autoImprimirVenta autoAbrirCajon'),
  pos: { ...fields('metodoPagoPredeterminado permitirPagoMixto permitirVentaSinExistencias requerirClienteEnCuentaCobro'), metodosPagoHabilitados: [scalar] },
  caja: { ...fields('baseAperturaSugerida umbralAlertaFaltante permitirRelevo'), rolesConTurnoObligatorio: [scalar] },
  modulos: { habilitados: [scalar] }, kds: fields('ordenComandas minutosAlerta minutosCritico agruparPorPedido'),
  autenticacionOperativa: fields('metodoPrincipal longitudPin maxFallosConsecutivos bloqueoMinutos exigirCambioCredencialTemporal'),
  preferencias: fields('formatoFecha formatoHora primerDiaSemana mostrarCentavos'),
  ultimaMutacion: fields('actorTipo actorId origen motivo'),
});
const subscription = adapter('relacionId relacionVigenteId planId planVersion periodicidad origen relacionAnteriorId trialInicio trialFin periodoInicio periodoFin graceFin cancelacionProgramadaPara canceladaEn ultimoPagoAnualId', { snapshotContrato: snapshot });
export const SINGLETON_ROOTS = new Set(['empresas', 'configuraciones', 'suscripciones', 'ofertas_comerciales_tenant', 'cuentas_control_nevera']);
export const SCHEMAS = Object.freeze({
  productos: adapter('nombre descripcion categoria categoriaId unidad unidadMedida costo precio stock stockReservado stockMinimo imagen imagenUrl codigo codigoBarras sku permiteFraccionamiento'),
  categorias: adapter('nombre icono orden color'),
  presentaciones_producto: adapter('productoId nombre factorUnidadBase precioCOP precioTiendaCOP precioConsumidorFinalCOP costoPresentacionCOP'),
  clientes: adapter('nombre cedula tipoDocumento nit telefono correo email contacto direccion barrioZona saldoPendienteBodegaCOP'),
  proveedores: adapter('nombre nit telefono correo direccion'),
  espacios: adapter('nombre descripcion tipo orden'),
  ventas: adapter(`modoOperacion estadoOperativo cajeroId cajeroNombre vendedorId clienteId clienteNombre clienteNombreSnapshot
    clienteDocumentoSnapshot metodoPago turnoId totalAbonadoCOP saldoPendienteCOP fechaCompromisoPagoLocal
    programacionId efectosOperativosEn subtotal total impuestos descuento ventaOriginalId motivoAnulacion anuladaEn`, {
    items: [item], pago: payment, totales: fields('subtotal impuestos descuento total'), reciboInterno: receipt,
  }),
  abonos_bodega: adapter('ventaId clienteId montoCOP metodoPago actorUid rol movimientoFinancieroId turnoId fechaCompromisoPagoLocal'),
  compromisos_pago_bodega: adapter('ventaId clienteId abonoId fechaCompromisoPagoLocal actorUid rol montoAbonoCOP saldoPendienteCOP'),
  compras: adapter('proveedor proveedorId proveedorNombre fechaCompra total subtotal impuestos usuarioId usuarioNombre cuentaId notas', { items: [item] }),
  movimientos_inventario: adapter(`articuloTipo articuloId articuloNombre tipo cantidad costoUnitario costoTotal unidad usuarioId usuarioNombre
    referenciaColeccion referenciaId claveIdempotencia clase signo versionModelo versionInventario costoUnidadBaseCOP
    secuenciaArticulo motivo stockAnterior stockPosterior cantidadAnterior cantidadPosterior`, { capasConsumidas: [layer], detalleCapas: [layer] }),
  capas_fifo_nevera: adapter('productoId movimientoOrigenId cantidadInicial cantidadRestante costoTotalInicialCOP costoRestanteCOP costoUnitarioCOP secuenciaArticulo cantidadUnidadBase costoTotalCOP'),
  cuentas_control_nevera: adapter('saldoCOP cargosCOP abonosCOP totalCargosCOP totalAbonosCOP'),
  cuentas_control_nevera_movimientos: adapter('tipo productoId movimientoId importeCOP saldoAnteriorCOP saldoPosteriorCOP referenciaColeccion referenciaId motivo', { detalleCapas: [layer] }),
  ofertas_bodega: adapter('nombre inicioEn finEn cerradaEn creadaPorUid actualizadaPorUid cerradaPorUid', { lineas: [fields('presentacionId canal precioFinalCOP')] }),
  cuentas_bancarias: adapter('nombre tipo banco numeroCuenta saldo moneda esPrincipal cuentaCodigo'),
  transacciones_financieras: adapter('tipo monto moneda cuentaId cuentaNombre categoria descripcion concepto usuarioId usuarioNombre actorUid rol ventaId compraId turnoId egresoId referenciaId fechaOperacion'),
  egresos: adapter('concepto descripcion monto categoria cuentaId cuentaNombre usuarioId usuarioNombre turnoId proveedorId'),
  mermas: adapter('productoId productoNombre insumoId cantidad unidad motivo costo costoTotal usuarioId usuarioNombre'),
  insumos: adapter('nombre descripcion unidad unidadMedida costo stock stockMinimo categoriaId'),
  recetas: adapter('nombre productoId rendimiento unidad', { ingredientes: [fields('insumoId nombre cantidad unidad costo')] }),
  mesas: adapter('numero nombre capacidad ubicacion orden'),
  turnos: adapter('usuarioId usuarioNombre cajeroId aperturaEn cierreEn fechaApertura fechaCierre saldoInicial saldoFinal efectivoEsperado efectivoContado diferencia totalVentas totalEgresos totalTransferencias'),
  turnos_activos: adapter('usuarioId turnoId cajeroId'),
  liquidaciones: adapter('usuarioId turnoId monto total fechaInicio fechaFin observaciones'),
  consignadores: adapter('nombre telefono cedula direccion saldo'),
  usuarios: adapter('uid nombre username email rol permisos ultimoAcceso', { permisos: [scalar] }),
  membresias: adapter('uid rol permisos origen', { permisos: [scalar] }),
  secuencias_documentales: adapter('tipoDocumento ultimoConsecutivo'),
  empresas: adapter('nombre nombreComercial slug paisFiscal ownerUid esFundacional vertical', { ultimaTransicion: fields('ocurridaEn actorId origen motivo') }),
  configuraciones: configuration,
  suscripciones: subscription,
  relaciones: subscription,
  ofertas_comerciales_tenant: adapter('ofertaActivaId'),
  ofertas: adapter('ofertaId empresaIdObjetivo planIdBase planVersionBase periodicidad iniciaEn expiraEn motivoCodigo referenciaAprobacion trialDias referenciaAceptacionCliente trialInicio trialFin', { precioAcordado: price, consumidaPor: fields('empresaId provisionamientoId') }),
  pedidos_activos: adapter('mesaId nombreMesa cajeroId estado activo inicioAlquiler fechaPago ventaId unionDestinoId actualizadoEn', {
    items: [salonItem], comandaIds: [scalar], movimientos: [pedidoMovement],
  }),
  comandas_cocina: adapter('pedidoId mesaId nombreMesa espacioId cajeroId estado tipo creadoEn completadoEn', {
    items: [{ ...fields('uid name notas'), quantity: scalar, modificadores: [modifier] }],
  }),
  reservas: adapter('mesaId espacioId fechaInicio fechaFin fechaLocal bloques montoTotal clienteNombre clienteEmail clienteTelefono referenciaPago referenciaTransaccion estadoPago estadoReserva fechaCreacion holdExpira ventaId', { items: [item] }),
  agendas: adapter('mesaId espacioId actualizadoEn', { bloques: recordOf(fields('reservaId estado holdExpira creadoEn')) }),
  numeraciones: adapter('numeracionId paisFiscal tipoDocumento scope prefijo resolucion rangoInicio rangoFin ultimoAsignado vigenciaDesde vigenciaHasta estado revision'),
  auditoria_logs: adapter(`accion detalle uid timestamp agregado comando revisionAnterior revisionNueva actorId actorUid actorTipo origen motivo impactoFiscal incorporacionId tokenVersion mecanismo correo accionId ocurridoEn categoria recurso resultado
    evento tipo schemaVersion`, { rutas: [scalar], seccionesAfectadas: [scalar], metadata: fields('motivo codigo actor estado') }),
  eventos_dominio: adapter('eventId tipo version agregado revisionAnterior revisionNueva actorId actorTipo origen motivo impactoFiscal schemaVersion', { rutas: [scalar], seccionesAfectadas: [scalar] }),
  operaciones_auditoria: adapter('tipo resultado correlationId causationId estado', {
    actor: operationActor, comando: operationCommand, motivo: scalar, intencion: operationIntent,
    referencias: operationReferences,
  }),
});

export const INTERNAL_ROOTS = new Set(`bootstrap_identidades_owner comandos_comerciales configuracion configuracion_comandos
  configuracion_command_ids credenciales_operativas incorporaciones operaciones_comandos operaciones_command_idempotency
  permisos_roles planes provisionamientos_empresariales reservas_codigos_operativos restablecimientos_credencial
  saas_auditoria saas_auditoria_obligaciones saas_comandos saas_operadores saas_soporte_autorizaciones
  saas_platform_bindings saas_platform_binding_external_tenants invitaciones consumo controles_release_compras`.split(/\s+/));

// These sources need explicit adapters before a populated source can be delivered.
// They are NEVER silently omitted or exported using an unconstrained object schema.
export const PENDING_ROOTS = new Set(`agendas auditoria_logs comandas_cocina configuracion
  eventos eventos_operativos modificador_grupos producto_modificador_grupos
  reservas numeraciones asignaciones_numeracion pagos_saas
  agenda_pedidos_bodega reservas_stock_bodega solicitudes_venta_bodega`.split(/\s+/));

export const TECHNICAL_FIELDS = new Set(`commandId idempotencyKey correlationId causationId creadoPor actualizadoPor
  pinHash token tokenDigest tokenVersion fcmTokens password refreshToken accessToken firebaseStorageDownloadTokens`.split(/\s+/));

export function inspectCoverage(roots) {
  if (!Array.isArray(roots) || roots.some(name => typeof name !== 'string') || new Set(roots).size !== roots.length) throw new Error('EXPORT_INVALID_ROOT_INVENTORY');
  const classifications = [...roots].sort().map(name => ({ name, status: SCHEMAS[name] ? 'ADAPTER_DEFINED' : INTERNAL_ROOTS.has(name) ? 'EXCLUDED_INTERNAL' : PENDING_ROOTS.has(name) ? 'ADAPTER_REQUIRED' : 'UNCLASSIFIED' }));
  return {
    mode: 'METADATA_ONLY',
    // This is only root adapter coverage, never a certificate over actual fields or children.
    rootAdaptersComplete: classifications.every(row => row.status === 'ADAPTER_DEFINED' || row.status === 'EXCLUDED_INTERNAL'),
    productionExportCertified: false,
    classifications,
  };
}

export function projectDocument(data, schema, depth = 0) {
  if (depth > 24) throw new Error('EXPORT_MAX_DEPTH');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('EXPORT_INVALID_DOCUMENT');
  const result = Object.create(null);
  for (const key of Object.keys(data).sort()) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('EXPORT_UNSAFE_KEY');
    if (TECHNICAL_FIELDS.has(key)) continue;
    if (!Object.hasOwn(schema, key)) throw new Error('EXPORT_UNSUPPORTED_FIELD');
    const value = data[key], rule = schema[key];
    if (value === null) { result[key] = null; continue; }
    if (rule === scalar) {
      if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('EXPORT_INVALID_SCALAR');
      if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
        let url;
        try { url = new URL(value); } catch { throw new Error('EXPORT_INVALID_URL'); }
        if ([...url.searchParams.keys()].some(k => /^(token|access_token|x-goog-signature|googleaccessid|x-amz-signature)$/i.test(k))) throw new Error('EXPORT_PRIVATE_URL_REQUIRES_ASSET_REFERENCE');
      }
      result[key] = value;
    } else if (rule && typeof rule === 'object' && !Array.isArray(rule) && Object.hasOwn(rule, '$record')) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EXPORT_INVALID_RECORD');
      const entries = Object.create(null);
      for (const [recordKey, recordValue] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(recordKey)) throw new Error('EXPORT_INVALID_RECORD_KEY');
        entries[recordKey] = projectDocument(recordValue, rule.$record, depth + 1);
      }
      result[key] = entries;
    } else if (Array.isArray(rule)) {
      if (!Array.isArray(value)) throw new Error('EXPORT_INVALID_ARRAY');
      result[key] = value.map(v => rule[0] === scalar ? projectDocument({ v }, { v: scalar }, depth + 1).v : projectDocument(v, rule[0], depth + 1));
    } else result[key] = projectDocument(value, rule, depth + 1);
  }
  return result;
}
