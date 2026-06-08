const initSqlJs = require('sql.js');
const { app }   = require('electron');
const path  = require('path');
const fs    = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const SENSITIVE_CONFIG_KEYS = [
  'factus_client_id', 'factus_client_secret',
  'factus_username', 'factus_password',
  'nit_tienda', 'telefono', 'direccion_tienda',
];

class DB {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'pos_tienda.db');
    this.SQL    = null;
    this.db     = null;
  }

  async open() {
    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const data = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(data);
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run('PRAGMA journal_mode = WAL;');
    await this.init();
    this.seedData();
    await this.save();
  }

  async save() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  async hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async verifyPassword(plainPassword, storedHash) {
    try {
      return await bcrypt.compare(plainPassword, storedHash);
    } catch {
      return false;
    }
  }

  async verifyAndMigratePassword(plainPassword, storedHash, userId) {
    const crypto = require('crypto');

    if (!storedHash || storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
      return bcrypt.compare(plainPassword, storedHash);
    }

    const legacyHash = crypto.createHash('sha256').update(plainPassword).digest('hex');
    if (legacyHash === storedHash) {
      const newHash = await this.hashPassword(plainPassword);
      this.db.run('UPDATE usuarios SET password = ?, debe_cambiar_password = 0 WHERE id = ?', [newHash, userId]);
      await this.save();
      return true;
    }
    return false;
  }

  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS productos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre      TEXT    NOT NULL,
        precio      REAL    NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        categoria   TEXT    NOT NULL DEFAULT 'General',
        emoji       TEXT    NOT NULL DEFAULT '',
        barcode     TEXT,
        creado_en   TEXT    DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        total           REAL    NOT NULL,
        pago            REAL    NOT NULL DEFAULT 0,
        cambio          REAL    NOT NULL DEFAULT 0,
        items_count     INTEGER NOT NULL DEFAULT 0,
        metodo_pago     TEXT    NOT NULL DEFAULT 'Efectivo',
        fecha           TEXT    DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS detalle_venta (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id    INTEGER NOT NULL,
        producto_id INTEGER,
        nombre      TEXT    NOT NULL,
        precio      REAL    NOT NULL,
        cantidad    INTEGER NOT NULL,
        subtotal    REAL    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS facturas_electronicas (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id    INTEGER NOT NULL,
        numero      TEXT,
        cufe        TEXT,
        qr          TEXT,
        pdf_url     TEXT,
        fecha       TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS proveedores (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre                  TEXT    NOT NULL,
        nit                     TEXT,
        tipo_contribuyente      TEXT,
        responsabilidad_fiscal  TEXT,
        direccion               TEXT,
        ciudad                  TEXT,
        telefono                TEXT,
        email                   TEXT,
        contacto                TEXT,
        notas                   TEXT,
        estado                  INTEGER DEFAULT 1,
        creado_en               TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS clientes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre          TEXT    NOT NULL,
        identificacion  TEXT    NOT NULL UNIQUE,
        tipo_documento  TEXT,
        email           TEXT    NOT NULL,
        telefono        TEXT,
        direccion       TEXT,
        ciudad          TEXT,
        notas           TEXT,
        estado          INTEGER DEFAULT 1,
        eliminado       INTEGER DEFAULT 0,
        eliminado_en    TEXT,
        eliminado_por   TEXT,
        creado_en       TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS auditoria (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario     TEXT,
        accion      TEXT    NOT NULL,
        detalles    TEXT,
        fecha       TEXT    DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario     TEXT    NOT NULL UNIQUE,
        password    TEXT    NOT NULL,
        rol         TEXT    NOT NULL DEFAULT 'admin'
      );

      CREATE TABLE IF NOT EXISTS turnos (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_apertura          TEXT    DEFAULT (datetime('now','localtime')),
        fecha_cierre            TEXT,
        base_inicial            REAL    NOT NULL DEFAULT 0,
        efectivo_esperado       REAL    NOT NULL DEFAULT 0,
        efectivo_real           REAL,
        descuadre               REAL,
        estado                  INTEGER NOT NULL DEFAULT 1,
        usuario_id              INTEGER,
        creado_en               TEXT    DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS movimientos_caja (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id    INTEGER NOT NULL,
        tipo        TEXT    NOT NULL,
        monto       REAL    NOT NULL,
        descripcion TEXT    NOT NULL,
        fecha       TEXT    DEFAULT (datetime('now','localtime'))
      );
    `);

    // Migraciones y integridad de datos
    try { this.db.run("ALTER TABLE ventas ADD COLUMN eliminado INTEGER DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN usuario_id INTEGER"); } catch (_) {}
    try { this.db.run("ALTER TABLE auditoria ADD COLUMN ip TEXT"); } catch (_) {}
    
    // Migraciones de seguridad
    try { this.db.run("ALTER TABLE usuarios ADD COLUMN activo INTEGER DEFAULT 1"); } catch (_) {}
    try { this.db.run("ALTER TABLE usuarios ADD COLUMN creado_por TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE usuarios ADD COLUMN ultimo_acceso TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE usuarios ADD COLUMN debe_cambiar_password INTEGER DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN eliminado INTEGER DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN eliminado_en TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN eliminado_por TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN eliminado INTEGER DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN eliminado_en TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN eliminado_por TEXT"); } catch (_) {}

    // Configuración inicial de seguridad
    const userRes = this.db.exec("SELECT COUNT(*) FROM usuarios");
    if (userRes[0].values[0][0] === 0) {
      const tempPassword = 'admin1234';
      const hash = await this.hashPassword(tempPassword);
      this.db.run("INSERT INTO usuarios (usuario, password, rol, debe_cambiar_password, creado_por) VALUES (?,?,?,?,?)",
        ['admin', hash, 'admin', 1, 'sistema']);

      const tempFile = path.join(app.getPath('userData'), '.credenciales_iniciales.txt');
      const credencialesMsg =
        '=== CREDENCIALES INICIALES MiTienda POS (CAMBIE INMEDIATAMENTE) ===\n' +
        'Usuario: admin\n' +
        `Contrasena: ${tempPassword}\n` +
        'Este archivo se eliminara automaticamente.\n' +
        '=== GUARDE ESTA CONTRASENA EN UN LUGAR SEGURO ===\n';
      fs.writeFileSync(tempFile, credencialesMsg, 'utf-8');
      console.log('\n=====================================================');
      console.log('  CREDENCIALES INICIALES MiTienda POS');
      console.log(`  Usuario: admin`);
      console.log(`  Contrasena: ${tempPassword}`);
      console.log('  CAMBIE LA CONTRASENA INMEDIATAMENTE');
      console.log('=====================================================\n');

      setTimeout(() => {
        try { fs.unlinkSync(tempFile); } catch (_) {}
      }, 5 * 60 * 1000);
    }

    try { this.db.run("ALTER TABLE ventas ADD COLUMN metodo_pago TEXT NOT NULL DEFAULT 'Efectivo'"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN costo REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN iva REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN impoconsumo REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN subtotal_ventas REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN iva_total REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN impoconsumo_total REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE detalle_venta ADD COLUMN iva_monto REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE detalle_venta ADD COLUMN impoconsumo_monto REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN pais TEXT DEFAULT 'Colombia'"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN departamento TEXT"); } catch (_) {}
    try { this.db.run("ALTER TABLE proveedores ADD COLUMN estado INTEGER DEFAULT 1"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN proveedor_id INTEGER"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN cliente_id INTEGER"); } catch (_) {}
    try { this.db.run("ALTER TABLE clientes ADD COLUMN ciudad TEXT"); } catch (_) {}
    await this.save();

    // Migrar: nuevas claves de config para factura física
    const newKeys = [
      ['direccion_tienda',   ''],
      ['resolucion_dian',    ''],
      ['responsable_iva',    '0'],
      ['tipo_contribuyente', 'Persona Natural'],
      ['num_factura_fisica', '1'],
    ];
    for (const [k, v] of newKeys) {
      this.db.run('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)', [k, v]);
    }
    await this.save();
  }

  seedData() {
    const res   = this.db.exec('SELECT COUNT(*) as c FROM productos');
    const count = res[0]?.values[0][0] || 0;
    if (count > 0) return;

    const defaultConfig = [
      ['nombre_tienda',        'Autoservicio J Y S'],
      ['nombre_propietario',   'Jesus Zapata'],
      ['ciudad',               'Apartado'],
      ['telefono',             'ENC:MzIzMzQ0Njg0NA=='],
      ['nit_tienda',           'ENC:NzE4MDAzOTM='],
      ['direccion_tienda',     'ENC:Q2FsbGUgOTIgIzk1QS0xMTk='],
      ['resolucion_dian',      ''],
      ['responsable_iva',      '1'],
      ['tipo_contribuyente',   'No Responsable de IVA'],
      ['num_factura_fisica',   '1'],
      ['resolucion_vigencia',  ''],
      ['factus_base_url',      'https://api-sandbox.factus.com.co'],
      ['factus_client_id',     'a1c1b571-4f48-4382-94c6-f3306c41f2a5'],
      ['factus_client_secret', 'HmXGGDo1BjUYL96kLFS7rDuRLQRGLsabNCkP5DRt'],
      ['factus_username',      'sandboxv2@factus.com.co'],
      ['factus_password',      'sandbox2026%'],
      ['factus_rango_id',      ''],
    ];
    for (const [k, v] of defaultConfig) {
      this.db.run('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)', [k, v]);
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  _all(sql, params = []) {
    const res = this.db.exec(sql, params);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(row =>
      Object.fromEntries(columns.map((c, i) => [c, row[i]]))
    );
  }

  _get(sql, params = []) { return this._all(sql, params)[0] || null; }

  async _run(sql, params = []) {
    this.db.run(sql, params);
    const id = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
    await this.save();
    return id;
  }

  // ── Configuración ────────────────────────────────────────
  getConfig() {
    const rows = this._all('SELECT clave, valor FROM configuracion');
    const cfg = {};
    for (const r of rows) {
      cfg[r.clave] = SENSITIVE_CONFIG_KEYS.includes(r.clave)
        ? this._decryptConfigValue(r.valor)
        : r.valor;
    }
    return cfg;
  }

  async setConfig(clave, valor) {
    const finalValue = SENSITIVE_CONFIG_KEYS.includes(clave)
      ? this._encryptConfigValue(valor)
      : valor;
    this.db.run('INSERT OR REPLACE INTO configuracion (clave,valor) VALUES (?,?)', [clave, finalValue]);
    await this.save();
    return { ok: true };
  }

  _encryptConfigValue(plainText) {
    if (!plainText) return '';
    return 'ENC:' + Buffer.from(plainText, 'utf-8').toString('base64');
  }

  _decryptConfigValue(storedValue) {
    if (!storedValue) return '';
    if (!storedValue.startsWith('ENC:')) return storedValue;
    try {
      return Buffer.from(storedValue.slice(4), 'base64').toString('utf-8');
    } catch {
      return storedValue;
    }
  }

  // Obtiene y avanza el consecutivo de factura física
  async nextNumFacturaFisica() {
    const row = this._get("SELECT valor FROM configuracion WHERE clave='num_factura_fisica'");
    const current = parseInt(row?.valor || '1', 10);
    const next = current + 1;
    this.db.run("INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('num_factura_fisica',?)", [String(next)]);
    await this.save();
    return current; // devuelve el número a usar ahora
  }

  // ── Gestión de Usuarios y Seguridad ───────────────────────
  async getUser(usuario) {
    return this._get('SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
  }

  async updatePassword(usuario, plainPassword) {
    const hash = await this.hashPassword(plainPassword);
    this.db.run('UPDATE usuarios SET password = ?, debe_cambiar_password = 0 WHERE usuario = ?', [hash, usuario]);
    await this.registrarAuditoria(usuario, 'CAMBIO_PASSWORD', `Se cambio la contrasena del usuario ${usuario}`);
    await this.save();
    return { ok: true };
  }

  async getAllUsers() {
    return this._all('SELECT id, usuario, rol, creado_en, activo, debe_cambiar_password FROM usuarios WHERE activo = 1 ORDER BY usuario');
  }

  async createUser(usuario, plainPassword, rol, creadoPor) {
    const exists = this._get('SELECT id FROM usuarios WHERE usuario = ? AND activo = 1', [usuario]);
    if (exists) return { ok: false, error: 'El usuario ya existe' };
    if (usuario.length < 4) return { ok: false, error: 'El usuario debe tener al menos 4 caracteres' };
    if (plainPassword.length < 8) return { ok: false, error: 'La contrasena debe tener al menos 8 caracteres' };

    const hash = await this.hashPassword(plainPassword);
    const id = await this._run(
      'INSERT INTO usuarios (usuario, password, rol, creado_por, debe_cambiar_password) VALUES (?,?,?,?,?)',
      [usuario, hash, rol, creadoPor, 1]
    );
    await this.registrarAuditoria(creadoPor, 'CREACION_USUARIO', `Usuario "${usuario}" creado con rol ${rol}`);
    return { ok: true, id };
  }

  async updateUserRole(id, nuevoRol, modificadoPor) {
    const user = this._get('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!user) return { ok: false, error: 'Usuario no encontrado' };
    if (user.rol === nuevoRol) return { ok: true };

    this.db.run('UPDATE usuarios SET rol = ? WHERE id = ?', [nuevoRol, id]);
    await this.save();
    await this.registrarAuditoria(modificadoPor, 'CAMBIO_ROL', `Rol de "${user.usuario}" cambiado de ${user.rol} a ${nuevoRol}`);
    return { ok: true };
  }

  async deleteUser(id, eliminadoPor) {
    if (id === 1) return { ok: false, error: 'No se puede desactivar el usuario administrador principal' };

    const user = this._get('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!user) return { ok: false, error: 'Usuario no encontrado' };

    this.db.run('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
    await this.save();
    await this.registrarAuditoria(eliminadoPor, 'ELIMINACION_USUARIO', `Usuario "${user.usuario}" desactivado por ${eliminadoPor}`);
    return { ok: true };
  }

  async backupDatabase() {
    try {
      const backupDir = path.join(app.getPath('userData'), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
      
      const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const backupPath = path.join(backupDir, fileName);
      
      const data = this.db.export();
      fs.writeFileSync(backupPath, Buffer.from(data));
      
      await this.registrarAuditoria('sistema', 'BACKUP_AUTOMATICO', `Copia de seguridad creada: ${fileName}`);
      return { ok: true, path: backupPath };
    } catch (err) {
      console.error('Error en backup:', err);
      return { ok: false, error: err.message };
    }
  }


  // ── Auditoría y Seguridad ──────────────────────────────
  async registrarAuditoria(usuario, accion, detalles) {
    this.db.run('INSERT INTO auditoria (usuario, accion, detalles) VALUES (?,?,?)', [usuario, accion, detalles]);
    await this.save();
  }

  // ── Productos ────────────────────────────────────────────
  getAllProductos() {
    return this._all('SELECT * FROM productos WHERE (eliminado = 0 OR eliminado IS NULL) ORDER BY categoria, nombre');
  }

  getProductoByBarcode(barcode) {
    return this._get('SELECT * FROM productos WHERE barcode = ? AND (eliminado = 0 OR eliminado IS NULL)', [barcode]);
  }

  async saveProducto(p) {
    if (p.id) {
      this.db.run(
        'UPDATE productos SET nombre=?,precio=?,stock=?,categoria=?,emoji=?,barcode=?,costo=?,iva=?,impoconsumo=?,proveedor_id=? WHERE id=?',
        [p.nombre, p.precio, p.stock, p.categoria, p.emoji || '', p.barcode || null, p.costo || 0, p.iva || 0, p.impoconsumo || 0, p.proveedor_id || null, p.id]
      );
      await this.save();
      return { id: p.id };
    } else {
      const id = await this._run(
        'INSERT INTO productos (nombre,precio,stock,categoria,emoji,barcode,costo,iva,impoconsumo,proveedor_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [p.nombre, p.precio, p.stock, p.categoria, p.emoji || '', p.barcode || null, p.costo || 0, p.iva || 0, p.impoconsumo || 0, p.proveedor_id || null]
      );
      return { id };
    }
  }

  async deleteProducto(id, usuario = 'sistema') {
    const prod = this._get('SELECT * FROM productos WHERE id = ?', [id]);
    if (!prod) return { ok: false, error: 'Producto no encontrado' };

    this.db.run(
      "UPDATE productos SET eliminado = 1, eliminado_en = datetime('now','localtime'), eliminado_por = ? WHERE id = ?",
      [usuario, id]
    );
    await this.save();
    await this.registrarAuditoria(usuario, 'ELIMINACION_PRODUCTO',
      `Producto "${prod.nombre}" (ID: ${id}) eliminado por ${usuario}`);
    return { ok: true };
  }

  async updateStock(id, delta) {
    this.db.run('UPDATE productos SET stock = MAX(0, stock + ?) WHERE id = ?', [delta, id]);
    await this.save();
    return this._get('SELECT stock FROM productos WHERE id=?', [id]);
  }

  async autoCategorizarProductos() {
    // 1. Obtener todos los productos no eliminados
    const productos = this._all('SELECT id, nombre, categoria FROM productos WHERE (eliminado = 0 OR eliminado IS NULL)');
    
    let count = 0;
    
    for (const p of productos) {
      const nombre = p.nombre || '';
      const text = nombre.toLowerCase();
      let nuevaCategoria = null;
      let nuevoIva = null;
      let nuevoImpo = null;

      // Heurística de auto-categorización basada en palabras clave de productos colombianos
      if (text.match(/coca cola|pepsi|\bgaseosa\b|\bjugo\b|\bhit\b|postobon|pony malta|mr tea|sprite|7up/)) {
        nuevaCategoria = "Bebidas";
      } else if (text.match(/cerveza|aguardiente|\bron\b|club colombia|poker|aguila|corona|heineken|buchanans|old parr/)) {
        nuevaCategoria = "Bebidas";
        nuevoImpo = 8;
      } else if (text.match(/arroz|frijol|lenteja|garbanzo|pasta|spagueti|harina|panela|diana|\broa\b|\bsal\b|azucar|lentejas|frijoles|arveja/)) {
        nuevaCategoria = "Granos";
        nuevoIva = 0;
      } else if (text.match(/leche|queso|yogurt|mantequilla|alpina|colanta|alqueria|kummis/)) {
        nuevaCategoria = "Lacteos";
        nuevoIva = 0;
      } else if (text.match(/\bpan\b|bimbo|tostada|galleta|saltin|festival|ducales|ponque|ramo|chocoramo/)) {
        nuevaCategoria = "Panaderia";
        if (text.includes("chocoramo")) nuevoImpo = 8;
      } else if (text.match(/aceite|gourmet|premier|rama/)) {
        nuevaCategoria = "Aceites";
      } else if (text.match(/\bfab\b|fabuloso|limpido|jabon|detergente|blanqueador|ariel|blancox|clorox|suavitel|shampoo|crema dental|colgate|papel higienico|familia/)) {
        nuevaCategoria = "Aseo";
      } else if (text.match(/papas|margarita|todito|gansito|chocolatina|jumbo|jet|doritos|cheetos|mani|de todito/)) {
        nuevaCategoria = "Snacks";
        nuevoImpo = 8;
      } else if (text.match(/atun|sardina|lata|enlatado/)) {
        nuevaCategoria = "Enlatados";
      }

      // Normalizar categorías previas con tilde para corregir la base de datos
      let currentCat = p.categoria || '';
      let shouldUpdate = false;

      if (currentCat === 'Panadería') {
        currentCat = 'Panaderia';
        shouldUpdate = true;
      } else if (currentCat === 'Lácteos') {
        currentCat = 'Lacteos';
        shouldUpdate = true;
      }

      // Solo actualizamos si no tiene categoría asignada (General, Otros o vacío) o si requiere normalización
      if (!p.categoria || p.categoria === 'General' || p.categoria === '' || p.categoria === 'Otros' || shouldUpdate) {
        const finalCat = nuevaCategoria || (shouldUpdate ? currentCat : null);
        
        const updates = [];
        const params = [];

        if (finalCat && finalCat !== p.categoria) {
          updates.push('categoria = ?');
          params.push(finalCat);
        }
        if (nuevoIva !== null) {
          updates.push('iva = ?');
          params.push(nuevoIva);
        }
        if (nuevoImpo !== null) {
          updates.push('impoconsumo = ?');
          params.push(nuevoImpo);
        }

        if (updates.length > 0) {
          params.push(p.id);
          this.db.run(`UPDATE productos SET ${updates.join(', ')} WHERE id = ?`, params);
          count++;
        }
      }
    }

    if (count > 0) {
      await this.save();
    }
    return { ok: true, count };
  }

  // ── Ventas ───────────────────────────────────────────────
  async registrarVenta(venta) {
    const { items, total, pago, cambio, metodoPago, subtotal_ventas, iva_total, impoconsumo_total, cliente_id } = venta;

    this.db.run(
      'INSERT INTO ventas (total,pago,cambio,items_count,metodo_pago,subtotal_ventas,iva_total,impoconsumo_total,cliente_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [total, pago, cambio, items.length, metodoPago || 'Efectivo', subtotal_ventas || 0, iva_total || 0, impoconsumo_total || 0, cliente_id || null]
    );
    const ventaId = this.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

    for (const item of items) {
      this.db.run(
        'INSERT INTO detalle_venta (venta_id,producto_id,nombre,precio,cantidad,subtotal,iva_monto,impoconsumo_monto) VALUES (?,?,?,?,?,?,?,?)',
        [ventaId, item.id || null, item.nombre, item.precio, item.cantidad, item.subtotal, item.iva_monto || 0, item.impoconsumo_monto || 0]
      );
      if (item.id) {
        this.db.run('UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?', [item.cantidad, item.id]);
      }
    }

    await this.save();
    return { ok: true, ventaId };
  }

  async deleteVenta(ventaId, usuario = 'admin') {
    const v = this.getVenta(ventaId);
    if (!v) return { ok: false, error: "Venta no encontrada" };

    // Trazabilidad: No borramos físicamente, marcamos como eliminado y guardamos quién lo hizo
    this.db.run('UPDATE ventas SET eliminado = 1 WHERE id = ?', [ventaId]);
    
    // Restaurar stock (esto es opcional dependiendo de la política del negocio, pero usualmente se hace si la venta se anula)
    for (const item of v.items) {
      if (item.producto_id) {
        this.db.run('UPDATE productos SET stock = stock + ? WHERE id = ?', [item.cantidad, item.producto_id]);
      }
    }

    await this.registrarAuditoria(usuario, 'ANULACION_VENTA', `Se anuló la venta #${ventaId} por un total de ${v.total}`);
    
    await this.save();
    return { ok: true };
  }

  getHistorial(fecha) {
    let sql = `
      SELECT v.id, v.total, v.pago, v.cambio, v.metodo_pago, v.fecha, v.subtotal_ventas, v.iva_total, v.impoconsumo_total,
        group_concat(d.nombre || ' x' || d.cantidad, ', ') as resumen,
        fe.cufe
      FROM ventas v
      LEFT JOIN detalle_venta d ON d.venta_id = v.id
      LEFT JOIN facturas_electronicas fe ON fe.venta_id = v.id
    `;
    const params = [];
    sql += ` WHERE (v.eliminado = 0 OR v.eliminado IS NULL)`;
    if (fecha) { sql += ` AND date(v.fecha) = ?`; params.push(fecha); }
    sql += ' GROUP BY v.id ORDER BY v.fecha DESC LIMIT 200';
    return this._all(sql, params);
  }

  getVenta(ventaId) {
    const v = this._get(`
      SELECT v.*, fe.cufe, fe.qr, fe.numero as numero_electronico,
             c.nombre as cliente_nombre, c.identificacion as cliente_identificacion,
             c.tipo_documento as cliente_tipo_documento, c.email as cliente_email,
             c.telefono as cliente_telefono, c.direccion as cliente_direccion
      FROM ventas v
      LEFT JOIN facturas_electronicas fe ON fe.venta_id = v.id
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = ?
    `, [ventaId]);
    if (!v) return null;
    if (v.cliente_nombre) {
      v.cliente = {
        tipo: v.cliente_tipo_documento,
        identificacion: v.cliente_identificacion,
        nombre: v.cliente_nombre,
        email: v.cliente_email,
        telefono: v.cliente_telefono,
        direccion: v.cliente_direccion
      };
    }
    v.items = this._all(`
      SELECT d.*, COALESCE(p.iva, 0) as iva, COALESCE(p.impoconsumo, 0) as impoconsumo, COALESCE(p.barcode, d.producto_id) as barcode
      FROM detalle_venta d
      LEFT JOIN productos p ON p.id = d.producto_id
      WHERE d.venta_id = ?
    `, [ventaId]);
    return v;
  }

  getTodasVentas() {
    return this._all(`
      SELECT v.id, v.total, v.pago, v.cambio, v.metodo_pago, v.fecha,
        group_concat(d.nombre || ' x' || d.cantidad, ', ') as resumen
      FROM ventas v
      LEFT JOIN detalle_venta d ON d.venta_id = v.id
      GROUP BY v.id ORDER BY v.fecha DESC
    `);
  }

  getDashboard() {
    const hoy = new Date().toISOString().split('T')[0];
    const now  = new Date();
    const mesStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const mesEnd   = hoy;

    // Stats del día
    const resumen = this._get(`
      SELECT COUNT(*) as transacciones,
        COALESCE(SUM(total),0) as ventas_total,
        COALESCE(AVG(total),0) as ticket_promedio
      FROM ventas WHERE date(fecha) = ? AND (eliminado = 0 OR eliminado IS NULL)
    `, [hoy]) || { transacciones:0, ventas_total:0, ticket_promedio:0 };

    // Stats del mes
    const resumenMes = this._get(`
      SELECT COUNT(*) as transacciones_mes,
        COALESCE(SUM(total),0) as ventas_mes,
        COALESCE(AVG(total),0) as ticket_mes
      FROM ventas WHERE date(fecha) BETWEEN ? AND ? AND (eliminado = 0 OR eliminado IS NULL)
    `, [mesStart, mesEnd]) || { transacciones_mes:0, ventas_mes:0, ticket_mes:0 };

    // Ventas por día del mes (para gráfica)
    const ventasMes = this._all(`
      SELECT date(fecha) as dia, COALESCE(SUM(total),0) as total_dia
      FROM ventas
      WHERE date(fecha) BETWEEN ? AND ? AND (eliminado = 0 OR eliminado IS NULL)
      GROUP BY dia ORDER BY dia
    `, [mesStart, mesEnd]);

    // Desglose por método de pago (hoy)
    const porMetodo = this._all(`
      SELECT metodo_pago, COUNT(*) as cnt, COALESCE(SUM(total),0) as total
      FROM ventas WHERE date(fecha) = ? AND (eliminado = 0 OR eliminado IS NULL)
      GROUP BY metodo_pago
    `, [hoy]);

    // Top productos
    const topProductos = this._all(`
      SELECT d.nombre, SUM(d.cantidad) as qty, SUM(d.subtotal) as total_vendido
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id
      WHERE date(v.fecha) = ? AND (v.eliminado = 0 OR v.eliminado IS NULL)
      GROUP BY d.nombre ORDER BY qty DESC LIMIT 5
    `, [hoy]);

    // Últimas ventas
    const ultimasVentas = this._all(`
      SELECT * FROM ventas WHERE date(fecha) = ? AND (eliminado = 0 OR eliminado IS NULL)
      ORDER BY fecha DESC LIMIT 8
    `, [hoy]);

    // Productos vendidos hoy
    const pvRow = this._get(`
      SELECT COALESCE(SUM(d.cantidad),0) as total
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id 
      WHERE date(v.fecha) = ? AND (v.eliminado = 0 OR v.eliminado IS NULL)
    `, [hoy]);

    return {
      ...resumen, ...resumenMes,
      topProductos, ultimasVentas,
      productosVendidos: pvRow?.total || 0,
      ventasMes, porMetodo
    };
  }

  // ── Facturas Electrónicas ────────────────────────────────
  async saveFactura({ ventaId, numero, cufe, qr, pdf }) {
    this.db.run(
      'INSERT INTO facturas_electronicas (venta_id, numero, cufe, qr, pdf_url) VALUES (?,?,?,?,?)',
      [ventaId, numero || '', cufe || '', qr || '', pdf || '']
    );
    await this.save();
    return { ok: true };
  }

  // ── Proveedores ───────────────────────────────────────────
  getAllProveedores() {
    return this._all('SELECT * FROM proveedores WHERE (eliminado = 0 OR eliminado IS NULL) ORDER BY nombre');
  }

  getProveedorByNit(nit) {
    return this._get('SELECT * FROM proveedores WHERE nit = ? AND (eliminado = 0 OR eliminado IS NULL)', [nit]);
  }

  async saveProveedor(p) {
    const estadoVal = p.estado !== undefined ? p.estado : 1;
    if (p.id) {
      this.db.run(
        `UPDATE proveedores SET
          nombre=?, nit=?, tipo_contribuyente=?, responsabilidad_fiscal=?,
          direccion=?, ciudad=?, telefono=?, email=?, contacto=?, notas=?,
          pais=?, departamento=?, estado=?
        WHERE id=?`,
        [
          p.nombre, p.nit || null, p.tipo_contribuyente || null,
          p.responsabilidad_fiscal || null, p.direccion || null,
          p.ciudad || null, p.telefono || null, p.email || null,
          p.contacto || null, p.notas || null, p.pais || 'Colombia', p.departamento || null,
          estadoVal, p.id
        ]
      );
      await this.save();
      return { id: p.id };
    } else {
      const id = await this._run(
        `INSERT INTO proveedores
          (nombre, nit, tipo_contribuyente, responsabilidad_fiscal,
           direccion, ciudad, telefono, email, contacto, notas, pais, departamento, estado)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.nombre, p.nit || null, p.tipo_contribuyente || null,
          p.responsabilidad_fiscal || null, p.direccion || null,
          p.ciudad || null, p.telefono || null, p.email || null,
          p.contacto || null, p.notas || null, p.pais || 'Colombia', p.departamento || null,
          estadoVal
        ]
      );
      return { id };
    }
  }

  async deleteProveedor(id, usuario = 'sistema') {
    const prov = this._get('SELECT * FROM proveedores WHERE id = ?', [id]);
    if (!prov) return { ok: false, error: 'Proveedor no encontrado' };

    this.db.run(
      "UPDATE proveedores SET eliminado = 1, eliminado_en = datetime('now','localtime'), eliminado_por = ? WHERE id = ?",
      [usuario, id]
    );
    await this.save();
    await this.registrarAuditoria(usuario, 'ELIMINACION_PROVEEDOR',
      `Proveedor "${prov.nombre}" (ID: ${id}) eliminado por ${usuario}`);
    return { ok: true };
  }

  // ── Clientes ──────────────────────────────────────────────
  getAllClientes() {
    return this._all('SELECT * FROM clientes WHERE (eliminado = 0 OR eliminado IS NULL) ORDER BY nombre');
  }

  getClienteByIdentificacion(identificacion) {
    return this._get('SELECT * FROM clientes WHERE identificacion = ? AND (eliminado = 0 OR eliminado IS NULL)', [identificacion]);
  }

  async saveCliente(c) {
    const estadoVal = c.estado !== undefined ? c.estado : 1;
    if (c.id) {
      this.db.run(
        `UPDATE clientes SET
          nombre=?, identificacion=?, tipo_documento=?, email=?,
          telefono=?, direccion=?, ciudad=?, notas=?, estado=?
        WHERE id=?`,
        [
          c.nombre, c.identificacion, c.tipo_documento || null,
          c.email, c.telefono || null, c.direccion || null, c.ciudad || null,
          c.notes || c.notas || null, estadoVal, c.id
        ]
      );
      await this.save();
      return { id: c.id };
    } else {
      const id = await this._run(
        `INSERT INTO clientes
          (nombre, identificacion, tipo_documento, email,
           telefono, direccion, ciudad, notas, estado)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          c.nombre, c.identificacion, c.tipo_documento || null,
          c.email, c.telefono || null, c.direccion || null, c.ciudad || null,
          c.notes || c.notas || null, estadoVal
        ]
      );
      return { id };
    }
  }

  async deleteCliente(id, usuario = 'sistema') {
    const cli = this._get('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!cli) return { ok: false, error: 'Cliente no encontrado' };

    this.db.run(
      "UPDATE clientes SET eliminado = 1, eliminado_en = datetime('now','localtime'), eliminado_por = ? WHERE id = ?",
      [usuario, id]
    );
    await this.save();
    await this.registrarAuditoria(usuario, 'ELIMINACION_CLIENTE',
      `Cliente "${cli.nombre}" (ID: ${id}) eliminado por ${usuario}`);
    return { ok: true };
  }

  // ── Caja / Turnos ─────────────────────────────────────────
  getTurnoActivo() {
    return this._get('SELECT * FROM turnos WHERE estado = 1 ORDER BY id DESC LIMIT 1');
  }

  getHistorialTurnos() {
    return this._all('SELECT * FROM turnos ORDER BY id DESC LIMIT 50');
  }

  async abrirTurno(base_inicial, usuario_id = null) {
    const activo = this.getTurnoActivo();
    if (activo) return { ok: false, error: 'Ya existe un turno abierto' };
    
    const id = await this._run(
      'INSERT INTO turnos (base_inicial, estado, usuario_id) VALUES (?, 1, ?)',
      [base_inicial || 0, usuario_id]
    );
    return { ok: true, turnoId: id };
  }

  async registrarMovimientoCaja(turnoId, tipo, monto, descripcion) {
    if (!turnoId) {
      const activo = this.getTurnoActivo();
      if (!activo) return { ok: false, error: 'No hay un turno abierto' };
      turnoId = activo.id;
    }
    await this._run(
      'INSERT INTO movimientos_caja (turno_id, tipo, monto, descripcion) VALUES (?, ?, ?, ?)',
      [turnoId, tipo, monto, descripcion]
    );
    return { ok: true };
  }

  getMovimientosCaja(turnoId) {
    return this._all('SELECT * FROM movimientos_caja WHERE turno_id = ? ORDER BY id ASC', [turnoId]);
  }

  getResumenTurno(turnoId) {
    const turno = this._get('SELECT * FROM turnos WHERE id = ?', [turnoId]);
    if (!turno) return null;

    let sqlVentas = `
      SELECT metodo_pago, COALESCE(SUM(total), 0) as total
      FROM ventas 
      WHERE fecha >= ? 
    `;
    const params = [turno.fecha_apertura];

    if (turno.estado === 0 && turno.fecha_cierre) {
      sqlVentas += ` AND fecha <= ? `;
      params.push(turno.fecha_cierre);
    }
    sqlVentas += ` AND (eliminado = 0 OR eliminado IS NULL) GROUP BY metodo_pago`;

    const ventas = this._all(sqlVentas, params);

    let ventasEfectivo = 0;
    let ventasOtros = 0;
    for (const v of ventas) {
      if ((v.metodo_pago || '').toLowerCase() === 'efectivo') ventasEfectivo += v.total;
      else ventasOtros += v.total;
    }

    const movimientos = this.getMovimientosCaja(turnoId);
    let totalIngresos = 0;
    let totalEgresos = 0;
    for (const m of movimientos) {
      if (m.tipo === 'ingreso') totalIngresos += m.monto;
      if (m.tipo === 'egreso') totalEgresos += m.monto;
    }

    const esperado = turno.base_inicial + ventasEfectivo + totalIngresos - totalEgresos;

    return {
      ...turno,
      ventasEfectivo,
      ventasOtros,
      totalIngresos,
      totalEgresos,
      movimientos,
      efectivo_esperado: turno.estado === 0 ? turno.efectivo_esperado : esperado
    };
  }

  async cerrarTurno(turnoId, efectivo_real, usuario = 'sistema') {
    const turno = this._get('SELECT * FROM turnos WHERE id = ? AND estado = 1', [turnoId]);
    if (!turno) return { ok: false, error: 'Turno no encontrado o ya cerrado' };

    const resumen = this.getResumenTurno(turnoId);
    const esperado = resumen.efectivo_esperado;
    const descuadre = efectivo_real - esperado;

    this.db.run(
      `UPDATE turnos SET 
        fecha_cierre = datetime('now','localtime'),
        efectivo_esperado = ?,
        efectivo_real = ?,
        descuadre = ?,
        estado = 0
       WHERE id = ?`,
      [esperado, efectivo_real, descuadre, turnoId]
    );

    await this.registrarAuditoria(usuario, 'CIERRE_CAJA', `Cierre del turno ${turnoId} con descuadre de ${descuadre}`);
    await this.save();

    return { 
      ok: true, 
      esperado, 
      efectivo_real, 
      descuadre,
      ventasEfectivo: resumen.ventasEfectivo
    };
  }

  async factoryReset(usuario = 'sistema') {
    const tables = ['productos', 'ventas', 'detalle_venta', 'proveedores', 'clientes', 'facturas_electronicas', 'auditoria'];
    for (const table of tables) {
      this.db.run(`DELETE FROM ${table};`);
      try {
        this.db.run(`DELETE FROM sqlite_sequence WHERE name="${table}";`);
      } catch (e) {
        // Ignorar si la tabla no está en sqlite_sequence
      }
    }
    
    await this.save();
    await this.registrarAuditoria(usuario, 'RESTABLECIMIENTO_FABRICA', 'Base de datos limpiada para paso a produccion.');
    return { ok: true };
  }

  close() { if (this.db) this.db.close(); }
}

module.exports = DB;
