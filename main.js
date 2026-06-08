const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const serve = require('electron-serve');

const loadApp = (serve.default || serve)({ directory: 'out' });

const Database = require('./src/database');
const FactusClient = require('./src/factus');
const rateLimiter = require('./src/rate-limiter');
const { exportarVentasExcel } = require('./src/exportador');
const authMiddleware = require('./src/auth-middleware');
const BackupManager = require('./src/backup-manager');
const DriveBackup = require('./src/drive-backup');
const AutoUpdaterManager = require('./src/auto-updater');

// ─── URL de actualizaciones (ofuscada) ────────────────────────────────────────
// Para cambiar la URL, ejecuta en Node.js:
//   const k='POS2025'; let e=''; for(let i=0;i<url.length;i++) e+=String.fromCharCode(url.charCodeAt(i)^k.charCodeAt(i%k.length)); console.log(Buffer.from(e,'binary').toString('base64'));
const _UPD_KEY = 'POS2025';
function _xorDecode(encoded) {
  try {
    const raw = Buffer.from(encoded, 'base64').toString('binary');
    let out = '';
    for (let i = 0; i < raw.length; i++)
      out += String.fromCharCode(raw.charCodeAt(i) ^ _UPD_KEY.charCodeAt(i % _UPD_KEY.length));
    return out;
  } catch { return ''; }
}
// URL pre-configurada (no visible en texto plano):
const _UPD_ENCODED = ''; // Sin repositorio por defecto

let mainWindow;
let db;
let backupManager;
let driveBackup;
let autoUpdaterMgr;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    icon: path.join(__dirname, 'public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'MiTienda POS',
    backgroundColor: '#0d0f18',
    show: false,
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    const loadNext = () => {
      mainWindow.loadURL('http://localhost:3000/pos').catch(() => {
        console.log('Esperando a Next.js...');
        setTimeout(loadNext, 1000);
      });
    };
    loadNext();
  } else {
    loadApp(mainWindow);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  db = new Database();
  await db.open();
  backupManager = new BackupManager(db);

  // NOTA: En PROYECTO CAFE ya no usamos Google Drive, ahora usamos Firebase.
  // driveBackup = new DriveBackup();
  // const driveOk = await driveBackup.initialize();
  // if (driveOk) {
  //   backupManager.setDriveBackup(driveBackup);
  //   console.log('[Drive] Sincronizacion con Google Drive activada.');
  // } else {
  //   console.log('[Drive] Sincronizacion con Drive deshabilitada o fallo la conexion.');
  // }

  startAutoBackup(backupManager);

  createWindow();

  autoUpdaterMgr = new AutoUpdaterManager(mainWindow);
  await autoUpdaterMgr.init();

  // 1. URL hardcodeada (ofuscada) tiene prioridad
  const hardcodedUrl = 'github:Glemynart/micafe-pos';
  // 2. Fallback: URL guardada en DB por el admin
  const cfg = db.getConfig();
  const updateUrl = hardcodedUrl || cfg.update_url || '';
  if (updateUrl) {
    autoUpdaterMgr.configureUrl(updateUrl);
    setTimeout(() => autoUpdaterMgr.checkForUpdatesSilent(), 5000);
    console.log('[Updater] Verificando actualizaciones...');
  } else {
    console.log('[Updater] URL de actualizacion no configurada.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

function startAutoBackup(backupMgr) {
  if (!backupMgr) return;

  const runBackup = async (motivo = 'sistema_automatico') => {
    try {
      const result = await backupMgr.createBackup(motivo);
      if (result.ok) {
        console.log(`[AutoBackup] Copia de seguridad automatica creada (${motivo}):`, result.path);
      }
    } catch (err) {
      console.error('[AutoBackup] Error en copia de seguridad:', err.message);
    }
  };

  // 1. Verificación al iniciar la aplicación:
  // Si la última copia de seguridad local no corresponde al día calendario actual,
  // se realiza una copia de seguridad inmediata. Esto protege el sistema si el PC se apaga por las noches.
  try {
    const backups = backupMgr.listBackups();
    const todayStr = new Date().toDateString();
    let necesitaBackupStartup = false;

    if (!backups || backups.length === 0) {
      necesitaBackupStartup = true;
    } else {
      const latestBackup = backups[0];
      const latestDateStr = new Date(latestBackup.created).toDateString();
      if (latestDateStr !== todayStr) {
        necesitaBackupStartup = true;
      }
    }

    if (necesitaBackupStartup) {
      console.log('[AutoBackup] Detectado cambio de dia sin copia de seguridad. Creando copia inicial...');
      // Retardar un poco para no ralentizar el inicio del proceso principal
      setTimeout(() => runBackup('respaldo_inicio_dia'), 8000);
    }
  } catch (err) {
    console.error('[AutoBackup] Error al verificar respaldos de inicio de dia:', err.message);
  }

  // 2. Programación precisa a las 12:00 AM (00:00) todos los días:
  const getMsUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Establece a las 00:00:00 del siguiente dia calendario
    return midnight.getTime() - now.getTime();
  };

  const scheduleNextMidnight = () => {
    const msToMidnight = getMsUntilMidnight();
    console.log(`[AutoBackup] Proxima copia de seguridad programada en ${Math.round(msToMidnight / 1000 / 60)} minutos (a las 00:00).`);
    
    setTimeout(async () => {
      await runBackup('respaldo_medianoche');
      scheduleNextMidnight(); // Programa la del dia siguiente
    }, msToMidnight);
  };

  scheduleNextMidnight();
}


// ─── IPC: Facturas PDF ─────────────────────────────────
ipcMain.handle('facturas:parsePdf', async (_, pdfBuffer) => {
  try {
    const pdfParse = require('pdf-parse');
    const buf = Buffer.from(pdfBuffer);
    const data = await pdfParse(buf);
    const text = data.text || '';

    const lines = text.split('\n');
    const items = [];

    // Regex: captura referencia (4-6 dígitos) + nombre del producto + cantidad al final de la línea
    // Soporta formato "59795 GALA TAJADA CHOCOLATE UNID X 60g  UND  1" o "59795  GALA...  1,00"
    const rowRegex = /^\s*(\d{4,6})\s{1,4}(.+?)\s{1,6}(\d+(?:[.,]\d+)?)\s*$/;
    // Regex alternativo para tablas con columnas separadas: referencia sola + descripción + cantidad
    const refOnlyRegex = /^\s*(\d{4,6})\s*$/;

    let pendingRef = null;
    let pendingNombre = null;

    const processNameAndQuantity = (rawName, rawQuantity) => {
      let nombre = rawName;
      let cantidad = rawQuantity;
      // Extraer multiplicador de cajas (ej: X 13, x13, * 13)
      const multiMatch = nombre.match(/(?:X|x|\*)\s*(\d+)\s*$/);
      if (multiMatch) {
        const multi = parseInt(multiMatch[1], 10);
        if (multi > 0) cantidad *= multi;
        nombre = nombre.replace(/(?:X|x|\*)\s*\d+\s*$/, '').trim();
      }
      // Limpiar unidades comunes al final del nombre
      nombre = nombre.replace(/\s+(UND|UNI|KG|LT|GR|PCS|BOL|CJA?|UNX?\d*)\s*$/i, '').trim();
      return { nombre, cantidad };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Intento 1: fila completa en una sola línea
      const m = line.match(rowRegex);
      if (m) {
        const ref = m[1];
        const cantStr = m[3].replace(',', '.');
        let cantidad = parseFloat(cantStr);
        
        const procesado = processNameAndQuantity(m[2], cantidad);
        const nombre = procesado.nombre;
        cantidad = procesado.cantidad;

        if (ref && nombre && cantidad > 0) {
          items.push({ referencia: ref, nombre, cantidad });
        }
        pendingRef = null;
        pendingNombre = null;
        continue;
      }

      // Intento 2: tablas con referencia en su propia columna
      if (refOnlyRegex.test(line)) {
        pendingRef = line.trim();
        pendingNombre = null;
        continue;
      }

      // Si hay una referencia pendiente, la siguiente línea con texto puede ser el nombre
      if (pendingRef && !pendingNombre && line.length > 3 && !/^\d+([.,]\d+)?$/.test(line)) {
        pendingNombre = line;
        continue;
      }

      // Si hay ref + nombre pendiente, siguiente línea numérica puede ser la cantidad
      if (pendingRef && pendingNombre && /^\d+([.,]\d+)?$/.test(line)) {
        let cantidad = parseFloat(line.replace(',', '.'));
        const procesado = processNameAndQuantity(pendingNombre, cantidad);
        
        if (procesado.cantidad > 0) {
          items.push({ referencia: pendingRef, nombre: procesado.nombre, cantidad: procesado.cantidad });
        }
        pendingRef = null;
        pendingNombre = null;
      }
    }

    console.log(`[PDF Parser] ${items.length} productos extraídos del PDF.`);
    return { ok: true, items };
  } catch (err) {
    console.error('[PDF Parser] Error:', err.message);
    return { ok: false, items: [], error: err.message };
  }
});

// ─── IPC: Productos ─────────────────────────────────────
ipcMain.handle('productos:getAll', () => db.getAllProductos());
ipcMain.handle('productos:getByBarcode', (_, bc) => db.getProductoByBarcode(bc));
ipcMain.handle('productos:save', (_, p) => db.saveProducto(p));
ipcMain.handle('productos:delete', authMiddleware.requireRole('admin')(
  (event, id) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.deleteProducto(id, user?.usuario || 'sistema');
  }
));
ipcMain.handle('productos:updateStock', (_, id, d) => db.updateStock(id, d));
ipcMain.handle('productos:autoCategorize', () => db.autoCategorizarProductos());

// ─── IPC: Ventas ─────────────────────────────────────────
ipcMain.handle('ventas:registrar', (_, v) => db.registrarVenta(v));
ipcMain.handle('ventas:delete', authMiddleware.requireRole('admin')(
  (event, id) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.deleteVenta(id, user?.usuario || 'sistema');
  }
));
ipcMain.handle('ventas:getHistorial', (_, fecha) => db.getHistorial(fecha));
ipcMain.handle('ventas:get', (_, id) => db.getVenta(id));
ipcMain.handle('ventas:getDashboard', () => db.getDashboard());
ipcMain.handle('ventas:getAll', () => db.getTodasVentas());
ipcMain.handle('ventas:exportarExcel', async (event, payload) => {
  const { ventas, fileName } = payload;
  const { dialog } = require('electron');
  const { filePath } = await dialog.showSaveDialog({
    title: 'Guardar Exportación de Ventas',
    defaultPath: fileName || 'Reporte_Ventas.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (filePath) {
    await exportarVentasExcel(ventas, filePath);
    return { ok: true, path: filePath };
  }
  return { ok: false, error: 'Cancelado por el usuario' };
});

// ─── IPC: Caja / Turnos ──────────────────────────────────
ipcMain.handle('caja:getTurnoActivo', () => db.getTurnoActivo());
ipcMain.handle('caja:getHistorialTurnos', () => db.getHistorialTurnos());
ipcMain.handle('caja:abrirTurno', authMiddleware.requireRole('*')(
  (event, base) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.abrirTurno(base, user?.id);
  }
));
ipcMain.handle('caja:cerrarTurno', authMiddleware.requireRole('*')(
  (event, turnoId, efectivoReal) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.cerrarTurno(turnoId, efectivoReal, user?.usuario || 'sistema');
  }
));
ipcMain.handle('caja:registrarMovimiento', authMiddleware.requireRole('*')(
  (_, turnoId, tipo, monto, descripcion) => {
    return db.registrarMovimientoCaja(turnoId, tipo, monto, descripcion);
  }
));
ipcMain.handle('caja:getResumenTurno', (_, turnoId) => db.getResumenTurno(turnoId));

// ─── IPC: Configuración ──────────────────────────────────
ipcMain.handle('config:get', () => db.getConfig());
ipcMain.handle('config:set', authMiddleware.requireRole('admin')(
  (_, k, v) => db.setConfig(k, v)
));
ipcMain.handle('config:nextNumFacturaFisica', () => db.nextNumFacturaFisica());
ipcMain.handle('config:backup', async () => {
  return backupManager ? backupManager.createBackup('sistema') : db.backupDatabase();
});
ipcMain.handle('config:factoryReset', authMiddleware.requireRole('admin')(
  async (event) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.factoryReset(user?.usuario || 'sistema');
  }
));

// ─── IPC: Seguridad y Auth ───────────────────────────────
ipcMain.handle('auth:login', async (event, usuario, plainPassword) => {
  const key = rateLimiter.getKey(usuario);

  if (rateLimiter.isLocked(key)) {
    await db.registrarAuditoria(usuario, 'LOGIN_BLOQUEADO',
      'Cuenta temporalmente bloqueada por multiples intentos fallidos');
    return { ok: false, error: 'Cuenta bloqueada temporalmente por seguridad. Intente en 15 minutos.' };
  }

  const user = await db.getUser(usuario);

  if (!user || !user.activo) {
    const delay = rateLimiter.recordAttempt(key);
    await db.registrarAuditoria(usuario || 'desconocido', 'LOGIN_FALLIDO',
      'Usuario no encontrado o inactivo');
    await new Promise(resolve => setTimeout(resolve, delay));
    return { ok: false, error: 'Credenciales invalidas' };
  }

  const valid = await db.verifyAndMigratePassword(plainPassword, user.password, user.id);

  if (!valid) {
    const attempts = rateLimiter.recordAttempt(key);
    await db.registrarAuditoria(usuario, 'LOGIN_FALLIDO',
      `Intento #${rateLimiter.getAttemptCount(key)} fallido`);
    await new Promise(resolve => setTimeout(resolve, Math.min(attempts, 30000)));
    return { ok: false, error: 'Credenciales invalidas' };
  }

  rateLimiter.resetAttempts(key);
  authMiddleware.setUserSession(event.sender, user);

  db.db.run("UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?",
    [user.id]);

  await db.registrarAuditoria(usuario, 'LOGIN_EXITOSO', 'Ingreso exitoso al sistema');

  return {
    ok: true,
    user: {
      id: user.id,
      usuario: user.usuario,
      rol: user.rol,
      debeCambiarPassword: user.debe_cambiar_password === 1,
    }
  };
});

ipcMain.handle('auth:logout', async (event) => {
  const user = authMiddleware.getUserFromEvent(event);
  if (user) {
    await db.registrarAuditoria(user.usuario, 'LOGOUT', 'Cierre de sesion');
  }
  authMiddleware.clearUserSession(event.sender);
  return { ok: true };
});

ipcMain.handle('auth:changePassword', authMiddleware.requireRole('*')(
  async (event, nuevaPassword) => {
    const user = authMiddleware.getUserFromEvent(event);
    if (!user) return { ok: false, error: 'No autenticado' };
    if (nuevaPassword.length < 8) return { ok: false, error: 'La contrasena debe tener al menos 8 caracteres' };
    return db.updatePassword(user.usuario, nuevaPassword);
  }
));

ipcMain.handle('auth:getAllUsers', authMiddleware.requireRole('admin')(
  () => db.getAllUsers()
));

ipcMain.handle('auth:createUser', authMiddleware.requireRole('admin')(
  async (event, usuario, plainPassword, rol) => {
    const currentUser = authMiddleware.getUserFromEvent(event);
    return db.createUser(usuario, plainPassword, rol, currentUser?.usuario || 'sistema');
  }
));

ipcMain.handle('auth:deleteUser', authMiddleware.requireRole('admin')(
  async (event, id) => {
    const currentUser = authMiddleware.getUserFromEvent(event);
    return db.deleteUser(id, currentUser?.usuario || 'sistema');
  }
));

ipcMain.handle('auth:updateUserRole', authMiddleware.requireRole('admin')(
  async (event, id, nuevoRol) => {
    const currentUser = authMiddleware.getUserFromEvent(event);
    return db.updateUserRole(id, nuevoRol, currentUser?.usuario || 'sistema');
  }
));

ipcMain.handle('auditoria:log', (_, u, a, d) => db.registrarAuditoria(u, a, d));


// ─── IPC: Factus (Facturación Electrónica) ───────────────
function getFactus() {
  const cfg = db.getConfig();
  if (!cfg.factus_client_id || !cfg.factus_client_secret) return null;
  return new FactusClient({
    baseUrl:      cfg.factus_base_url      || 'https://api-sandbox.factus.com.co',
    clientId:     cfg.factus_client_id,
    clientSecret: cfg.factus_client_secret,
    username:     cfg.factus_username,
    password:     cfg.factus_password,
  });
}

ipcMain.handle('factus:verificar', async () => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Credenciales Factus no configuradas' };
  return f.verificarCredenciales();
});

ipcMain.handle('factus:emitir', async (_, datos) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const cfg    = db.getConfig();
    const rangoId = cfg.factus_rango_id || null;
    
    // Obtener el ID real del rango (si rangoId es nulo, Factus nos devuelve el primero activo)
    const numInfo = await f.getSiguienteNumero(rangoId);
    if (!numInfo.ok) return { ok: false, error: numInfo.error };

    const result = await f.emitirFactura({
      ...datos,
      numeroFactura: numInfo.prefix + numInfo.siguiente,
      rangoId: numInfo.rangoId,
    });
    if (result.ok) db.saveFactura({ ventaId: datos.ventaId, ...result });
    return result;
  } catch (err) {
    console.error('[Factus:emitir] ERROR COMPLETO:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:getSiguienteNumero', async () => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const cfg    = db.getConfig();
    const rangoId = cfg.factus_rango_id || null;
    return f.getSiguienteNumero(rangoId);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:getRangos', async () => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const data = await f.getRangosNumeracion();
    return { ok: true, rangos: data.data || data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:consultarAdquiriente', async (_, tipoDocId, identificacion) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const res = await f.consultarAdquiriente(tipoDocId, identificacion);
    return { ok: true, data: res.data || res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:buscarCliente', async (_, identificacion) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const res = await f.buscarCliente(identificacion);
    // En Factus v2, los datos del cliente pueden estar envueltos en res.data o ser una lista
    const list = res.data || res;
    if (Array.isArray(list) && list.length > 0) {
      return { ok: true, cliente: list[0] };
    } else if (list && typeof list === 'object' && String(list.identification) === String(identificacion)) {
      return { ok: true, cliente: list };
    }
    // Si res.data es un array o lista, pero está vacía, o no coincide
    return { ok: false, error: 'Cliente no encontrado en Factus' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:emitirNotaCredito', async (_, data) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const numInfo = await f.getSiguienteNumero(null, 'Nota Crédito');
    if (!numInfo.ok) return { ok: false, error: numInfo.error };

    return await f.emitirNotaCredito({
      ...data,
      numeroFactura: numInfo.prefix + numInfo.siguiente,
      rangoId: numInfo.rangoId,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('factus:emitirNotaDebito', async (_, data) => {
  const f = getFactus();
  if (!f) return { ok: false, error: 'Factus no configurado' };
  try {
    const numInfo = await f.getSiguienteNumero(null, 'Nota Débito');
    if (!numInfo.ok) return { ok: false, error: numInfo.error };

    return await f.emitirNotaDebito({
      ...data,
      numeroFactura: numInfo.prefix + numInfo.siguiente,
      rangoId: numInfo.rangoId,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── IPC: Backup Manager ──────────────────────────────────
ipcMain.handle('backup:list', () => {
  return backupManager ? backupManager.listBackups() : [];
});

ipcMain.handle('backup:restoreLocal', async (_, filePath) => {
  return backupManager ? backupManager.restoreFromLocal(filePath) : { ok: false, error: 'No disponible' };
});

ipcMain.handle('backup:restoreDrive', async (_, fileId) => {
  return backupManager ? backupManager.restoreFromDrive(fileId) : { ok: false, error: 'No disponible' };
});

// ─── IPC: Google Drive ────────────────────────────────────
ipcMain.handle('drive:status', async () => {
  return driveBackup ? driveBackup.getStatus() : { ok: false, message: 'Drive no configurado' };
});

ipcMain.handle('drive:test', async () => {
  if (!driveBackup || !driveBackup.initialized) {
    return { ok: false, message: 'Drive no conectado.' };
  }
  return driveBackup.getStatus();
});

// ─── IPC: Actualizaciones ─────────────────────────────────
ipcMain.handle('update:status', () => {
  return autoUpdaterMgr ? autoUpdaterMgr.getStatus() : { ok: false, message: 'No disponible' };
});

ipcMain.handle('update:check', async () => {
  if (!autoUpdaterMgr) return { ok: false, message: 'No disponible' };
  await autoUpdaterMgr.checkForUpdates();
  return autoUpdaterMgr.getStatus();
});

ipcMain.handle('update:install', () => {
  if (!autoUpdaterMgr) return { ok: false };
  autoUpdaterMgr.installNow();
  return { ok: true };
});

// Solo para uso admin (no expuesto en UI de cliente)
ipcMain.handle('update:configure', async (_, url) => {
  if (!autoUpdaterMgr) return { ok: false, message: 'No disponible' };
  autoUpdaterMgr.configureUrl(url);
  await db.setConfig('update_url', url);
  await db.registrarAuditoria('sistema', 'CONFIG_UPDATE', `URL actualizada`);
  setTimeout(() => autoUpdaterMgr.checkForUpdatesSilent(), 3000);
  return { ok: true, message: 'URL configurada' };
});

// ─── IPC: Imprimir Ticket ──────────────────────────────────
function crearVentanaImpresion(htmlContent) {
  const tmpFile = path.join(os.tmpdir(), `pos_ticket_${Date.now()}.html`);
  fs.writeFileSync(tmpFile, htmlContent, 'utf-8');
  const win = new BrowserWindow({
    show: false,
    width: 420,
    height: 750,
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(tmpFile);
  return { win, tmpFile };
}

ipcMain.handle('print:ticket', async (_, htmlContent) => {
  console.log('[Print] Iniciando generacion de PDF...');
  return new Promise((resolve) => {
    const { win, tmpFile } = crearVentanaImpresion(htmlContent);

    win.webContents.once('did-finish-load', async () => {
      setTimeout(async () => {
        try {
          console.log('[Print] Creando buffer PDF...');
          const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            displayHeaderFooter: false,
            margins: { marginType: 'default' }
          });
          win.destroy();
          try { fs.unlinkSync(tmpFile); } catch (_) {}

          console.log('[Print] Abriendo dialogo de guardado...');
          const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
            title:       'Guardar Ticket como PDF',
            defaultPath: `ticket_${Date.now()}.pdf`,
            filters:     [{ name: 'PDF', extensions: ['pdf'] }],
          });

          if (!canceled && filePath) {
            fs.writeFileSync(filePath, pdfBuffer);
            console.log('[Print] PDF guardado en:', filePath);
            resolve({ success: true, filePath });
          } else {
            console.log('[Print] Guardado cancelado por el usuario');
            resolve({ success: false, reason: 'cancelled' });
          }
        } catch (err) {
          console.error('[Print] Error en PDF:', err.message);
          if (!win.isDestroyed()) win.destroy();
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          resolve({ success: false, reason: err.message });
        }
      }, 400);
    });

    setTimeout(() => {
      if (!win.isDestroyed()) { win.destroy(); try { fs.unlinkSync(tmpFile); } catch (_) {} }
      resolve({ success: false, reason: 'timeout' });
    }, 12000);
  });
});

ipcMain.handle('print:toPrinter', async (_, htmlContent) => {
  console.log('[Print] Enviando a impresora fisica...');
  return new Promise((resolve) => {
    const { win, tmpFile } = crearVentanaImpresion(htmlContent);
    
    // Obtener la configuración de la base de datos para la impresión silenciosa
    const cfg = db ? db.getConfig() : {};
    const silent = cfg.impresora_autoPrint === 'true' || cfg.impresora_autoPrint === true;

    if (!silent) {
      win.show();
      win.setAlwaysOnTop(true);
      win.focus();
    }

    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.print(
          { silent: silent, printBackground: true, margins: { marginType: 'none' } },
          (success, reason) => {
            console.log('[Print] Resultado impresion:', success ? 'OK' : 'Error/Cancelado', reason || '');
            // Esperar 2 segundos antes de destruir la ventana para dejar que el spooler de Windows termine de procesar el archivo
            setTimeout(() => {
              if (!win.isDestroyed()) win.destroy();
              try { fs.unlinkSync(tmpFile); } catch (_) {}
            }, 2000);
            resolve({ success, reason });
          }
        );
      }, 500);
    });

    setTimeout(() => {
      if (!win.isDestroyed()) { 
        console.log('[Print] Timeout de impresion fisica');
        win.destroy(); 
        try { fs.unlinkSync(tmpFile); } catch (_) {} 
      }
      resolve({ success: false, reason: 'timeout' });
    }, 60000);
  });
});

ipcMain.handle('app:openUrl', (_, url) => {
  if (url) shell.openExternal(url);
});

// ─── IPC: Proveedores ─────────────────────────────────
ipcMain.handle('proveedores:getAll',   ()        => db.getAllProveedores());
ipcMain.handle('proveedores:getByNit', (_, nit)  => db.getProveedorByNit(nit));
ipcMain.handle('proveedores:save',     (_, prov) => db.saveProveedor(prov));
ipcMain.handle('proveedores:delete', authMiddleware.requireRole('admin')(
  (event, id) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.deleteProveedor(id, user?.usuario || 'sistema');
  }
));

// ─── IPC: Clientes ────────────────────────────────────
ipcMain.handle('clientes:getAll',             ()       => db.getAllClientes());
ipcMain.handle('clientes:getByIdentificacion', (_, iden) => db.getClienteByIdentificacion(iden));
ipcMain.handle('clientes:save',               (_, cli)  => db.saveCliente(cli));
ipcMain.handle('clientes:delete', authMiddleware.requireRole('admin')(
  (event, id) => {
    const user = authMiddleware.getUserFromEvent(event);
    return db.deleteCliente(id, user?.usuario || 'sistema');
  }
));
