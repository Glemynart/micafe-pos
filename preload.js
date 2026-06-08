const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  productos: {
    getAll:        ()          => ipcRenderer.invoke('productos:getAll'),
    getByBarcode:  (barcode)   => ipcRenderer.invoke('productos:getByBarcode', barcode),
    save:          (producto)  => ipcRenderer.invoke('productos:save', producto),
    delete:        (id)        => ipcRenderer.invoke('productos:delete', id),
    updateStock:   (id, delta) => ipcRenderer.invoke('productos:updateStock', id, delta),
    autoCategorize:()          => ipcRenderer.invoke('productos:autoCategorize'),
  },
  ventas: {
    registrar:    (venta) => ipcRenderer.invoke('ventas:registrar', venta),
    delete:       (id)    => ipcRenderer.invoke('ventas:delete', id),
    getHistorial: (fecha) => ipcRenderer.invoke('ventas:getHistorial', fecha),
    getDashboard: ()      => ipcRenderer.invoke('ventas:getDashboard'),
    getAll:       ()      => ipcRenderer.invoke('ventas:getAll'),
    get:          (id)    => ipcRenderer.invoke('ventas:get', id),
    exportarExcel:(data)  => ipcRenderer.invoke('ventas:exportarExcel', data),
  },
  caja: {
    getTurnoActivo:     () => ipcRenderer.invoke('caja:getTurnoActivo'),
    getHistorialTurnos: () => ipcRenderer.invoke('caja:getHistorialTurnos'),
    abrirTurno:         (base) => ipcRenderer.invoke('caja:abrirTurno', base),
    cerrarTurno:        (turnoId, ef) => ipcRenderer.invoke('caja:cerrarTurno', turnoId, ef),
    registrarMovimiento:(tId, t, m, d) => ipcRenderer.invoke('caja:registrarMovimiento', tId, t, m, d),
    getResumenTurno:    (turnoId) => ipcRenderer.invoke('caja:getResumenTurno', turnoId),
  },
  config: {
    get:                  ()        => ipcRenderer.invoke('config:get'),
    set:                  (k, v)   => ipcRenderer.invoke('config:set', k, v),
    nextNumFacturaFisica: ()        => ipcRenderer.invoke('config:nextNumFacturaFisica'),
    factoryReset:         ()        => ipcRenderer.invoke('config:factoryReset'),
  },

  factus: {
    verificar:             ()              => ipcRenderer.invoke('factus:verificar'),
    emitir:                (datos)         => ipcRenderer.invoke('factus:emitir', datos),
    getSiguienteNumero:    ()              => ipcRenderer.invoke('factus:getSiguienteNumero'),
    getRangos:             ()              => ipcRenderer.invoke('factus:getRangos'),
    buscarCliente:         (iden)          => ipcRenderer.invoke('factus:buscarCliente', iden),
    consultarAdquiriente:  (tipo, numero)  => ipcRenderer.invoke('factus:consultarAdquiriente', tipo, numero),
    emitirNotaCredito:     (datos)         => ipcRenderer.invoke('factus:emitirNotaCredito', datos),
    emitirNotaDebito:      (datos)         => ipcRenderer.invoke('factus:emitirNotaDebito', datos),
  },
  print: {
    ticket:    (html) => ipcRenderer.invoke('print:ticket', html),
    toPrinter: (html) => ipcRenderer.invoke('print:toPrinter', html),
  },
  app: {
    openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),
  },
  proveedores: {
    getAll:    ()       => ipcRenderer.invoke('proveedores:getAll'),
    getByNit:  (nit)   => ipcRenderer.invoke('proveedores:getByNit', nit),
    save:      (prov)  => ipcRenderer.invoke('proveedores:save', prov),
    delete:    (id)    => ipcRenderer.invoke('proveedores:delete', id),
  },
  facturas: {
    parsePdf: (buf) => ipcRenderer.invoke('facturas:parsePdf', buf),
  },
  clientes: {
    getAll:             ()       => ipcRenderer.invoke('clientes:getAll'),
    getByIdentificacion: (iden)  => ipcRenderer.invoke('clientes:getByIdentificacion', iden),
    save:               (cli)   => ipcRenderer.invoke('clientes:save', cli),
    delete:             (id)    => ipcRenderer.invoke('clientes:delete', id),
  },
  auth: {
    login:          (u, p)       => ipcRenderer.invoke('auth:login', u, p),
    logout:         ()           => ipcRenderer.invoke('auth:logout'),
    changePassword: (nuevaPass)  => ipcRenderer.invoke('auth:changePassword', nuevaPass),
    getAllUsers:    ()           => ipcRenderer.invoke('auth:getAllUsers'),
    createUser:     (u, p, r)    => ipcRenderer.invoke('auth:createUser', u, p, r),
    deleteUser:     (id)         => ipcRenderer.invoke('auth:deleteUser', id),
    updateUserRole: (id, rol)    => ipcRenderer.invoke('auth:updateUserRole', id, rol),
  },
  auditoria: {
    log: (u, a, d) => ipcRenderer.invoke('auditoria:log', u, a, d),
    backup: ()      => ipcRenderer.invoke('config:backup'),
  },
  backup: {
    list:         ()        => ipcRenderer.invoke('backup:list'),
    restoreLocal: (path)    => ipcRenderer.invoke('backup:restoreLocal', path),
    restoreDrive: (fileId)  => ipcRenderer.invoke('backup:restoreDrive', fileId),
  },
  drive: {
    status: () => ipcRenderer.invoke('drive:status'),
    test:   () => ipcRenderer.invoke('drive:test'),
  },
  update: {
    status:    ()       => ipcRenderer.invoke('update:status'),
    check:     ()       => ipcRenderer.invoke('update:check'),
    install:   ()       => ipcRenderer.invoke('update:install'),
    configure: (url)    => ipcRenderer.invoke('update:configure', url),
    onStatus:  (cb)     => {
      ipcRenderer.on('update-status', (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners('update-status');
    },
  },
});
