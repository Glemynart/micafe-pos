const initSqlJs = require('sql.js');
const { app }   = require('electron');
const path  = require('path');
const fs    = require('fs');

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
    this.init();
    this.seedData();
    this.save();
  }

  save() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS productos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre      TEXT    NOT NULL,
        precio      REAL    NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        categoria   TEXT    NOT NULL DEFAULT 'General',
        emoji       TEXT    NOT NULL DEFAULT '🛍️',
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
        creado_en               TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    // Migrar: agregar columna metodo_pago si no existe (para DBs antiguas)
    try { this.db.run("ALTER TABLE ventas ADD COLUMN metodo_pago TEXT NOT NULL DEFAULT 'Efectivo'"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN costo REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN iva REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE productos ADD COLUMN impoconsumo REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN subtotal_ventas REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN iva_total REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE ventas ADD COLUMN impoconsumo_total REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE detalle_venta ADD COLUMN iva_monto REAL NOT NULL DEFAULT 0"); } catch (_) {}
    try { this.db.run("ALTER TABLE detalle_venta ADD COLUMN impoconsumo_monto REAL NOT NULL DEFAULT 0"); } catch (_) {}
    this.save();

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
    this.save();
  }

  seedData() {
    const res   = this.db.exec('SELECT COUNT(*) as c FROM productos');
    const count = res[0]?.values[0][0] || 0;
    if (count > 0) return;

    const defaultConfig = [
      ['nombre_tienda',        'MiTienda'],
      ['nombre_propietario',   ''],
      ['ciudad',               ''],
      ['telefono',             ''],
      ['nit_tienda',           ''],
      ['direccion_tienda',     ''],
      ['resolucion_dian',      ''],
      ['responsable_iva',      '0'],
      ['tipo_contribuyente',   'Persona Natural'],
      ['num_factura_fisica',   '1'],
      ['matias_base_url',      ''],
      ['matias_token',         ''],
      ['matias_activo',        '0'],
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

  _run(sql, params = []) {
    this.db.run(sql, params);
    this.save();
    return this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
  }

  // ── Configuración ────────────────────────────────────────
  getConfig() {
    const rows = this._all('SELECT clave, valor FROM configuracion');
    const cfg = {};
    for (const r of rows) cfg[r.clave] = r.valor;
    return cfg;
  }

  setConfig(clave, valor) {
    this.db.run('INSERT OR REPLACE INTO configuracion (clave,valor) VALUES (?,?)', [clave, valor]);
    this.save();
    return { ok: true };
  }

  // Obtiene y avanza el consecutivo de factura física
  nextNumFacturaFisica() {
    const row = this._get("SELECT valor FROM configuracion WHERE clave='num_factura_fisica'");
    const current = parseInt(row?.valor || '1', 10);
    const next = current + 1;
    this.db.run("INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('num_factura_fisica',?)", [String(next)]);
    this.save();
    return current; // devuelve el número a usar ahora
  }


  // ── Productos ────────────────────────────────────────────
  getAllProductos() {
    return this._all('SELECT * FROM productos ORDER BY categoria, nombre');
  }

  getProductoByBarcode(barcode) {
    return this._get('SELECT * FROM productos WHERE barcode = ?', [barcode]);
  }

  saveProducto(p) {
    if (p.id) {
      this.db.run(
        'UPDATE productos SET nombre=?,precio=?,stock=?,categoria=?,emoji=?,barcode=?,costo=?,iva=?,impoconsumo=? WHERE id=?',
        [p.nombre, p.precio, p.stock, p.categoria, p.emoji, p.barcode || null, p.costo || 0, p.iva || 0, p.impoconsumo || 0, p.id]
      );
      this.save();
      return { id: p.id };
    } else {
      const id = this._run(
        'INSERT INTO productos (nombre,precio,stock,categoria,emoji,barcode,costo,iva,impoconsumo) VALUES (?,?,?,?,?,?,?,?,?)',
        [p.nombre, p.precio, p.stock, p.categoria, p.emoji, p.barcode || null, p.costo || 0, p.iva || 0, p.impoconsumo || 0]
      );
      return { id };
    }
  }

  deleteProducto(id) {
    this.db.run('DELETE FROM productos WHERE id = ?', [id]);
    this.save();
    return { ok: true };
  }

  updateStock(id, delta) {
    this.db.run('UPDATE productos SET stock = MAX(0, stock + ?) WHERE id = ?', [delta, id]);
    this.save();
    return this._get('SELECT stock FROM productos WHERE id=?', [id]);
  }

  // ── Ventas ───────────────────────────────────────────────
  registrarVenta(venta) {
    const { items, total, pago, cambio, metodoPago, subtotal_ventas, iva_total, impoconsumo_total } = venta;

    this.db.run(
      'INSERT INTO ventas (total,pago,cambio,items_count,metodo_pago,subtotal_ventas,iva_total,impoconsumo_total) VALUES (?,?,?,?,?,?,?,?)',
      [total, pago, cambio, items.length, metodoPago || 'Efectivo', subtotal_ventas || 0, iva_total || 0, impoconsumo_total || 0]
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

    this.save();
    return { ok: true, ventaId };
  }

  getHistorial(fecha) {
    let sql = `
      SELECT v.id, v.total, v.pago, v.cambio, v.metodo_pago, v.fecha,
        group_concat(d.nombre || ' x' || d.cantidad, ', ') as resumen,
        fe.cufe
      FROM ventas v
      LEFT JOIN detalle_venta d ON d.venta_id = v.id
      LEFT JOIN facturas_electronicas fe ON fe.venta_id = v.id
    `;
    const params = [];
    if (fecha) { sql += ` WHERE date(v.fecha) = ?`; params.push(fecha); }
    sql += ' GROUP BY v.id ORDER BY v.fecha DESC LIMIT 200';
    return this._all(sql, params);
  }

  getVenta(ventaId) {
    const v = this._get('SELECT * FROM ventas WHERE id = ?', [ventaId]);
    if (!v) return null;
    v.items = this._all('SELECT * FROM detalle_venta WHERE venta_id = ?', [ventaId]);
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
      FROM ventas WHERE date(fecha) = ?
    `, [hoy]) || { transacciones:0, ventas_total:0, ticket_promedio:0 };

    // Stats del mes
    const resumenMes = this._get(`
      SELECT COUNT(*) as transacciones_mes,
        COALESCE(SUM(total),0) as ventas_mes,
        COALESCE(AVG(total),0) as ticket_mes
      FROM ventas WHERE date(fecha) BETWEEN ? AND ?
    `, [mesStart, mesEnd]) || { transacciones_mes:0, ventas_mes:0, ticket_mes:0 };

    // Ventas por día del mes (para gráfica)
    const ventasMes = this._all(`
      SELECT date(fecha) as dia, COALESCE(SUM(total),0) as total_dia
      FROM ventas
      WHERE date(fecha) BETWEEN ? AND ?
      GROUP BY dia ORDER BY dia
    `, [mesStart, mesEnd]);

    // Desglose por método de pago (hoy)
    const porMetodo = this._all(`
      SELECT metodo_pago, COUNT(*) as cnt, COALESCE(SUM(total),0) as total
      FROM ventas WHERE date(fecha) = ?
      GROUP BY metodo_pago
    `, [hoy]);

    // Top productos
    const topProductos = this._all(`
      SELECT d.nombre, SUM(d.cantidad) as qty, SUM(d.subtotal) as total_vendido
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id
      WHERE date(v.fecha) = ?
      GROUP BY d.nombre ORDER BY qty DESC LIMIT 5
    `, [hoy]);

    // Últimas ventas
    const ultimasVentas = this._all(`
      SELECT * FROM ventas WHERE date(fecha) = ?
      ORDER BY fecha DESC LIMIT 8
    `, [hoy]);

    // Productos vendidos hoy
    const pvRow = this._get(`
      SELECT COALESCE(SUM(d.cantidad),0) as total
      FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id WHERE date(v.fecha) = ?
    `, [hoy]);

    return {
      ...resumen, ...resumenMes,
      topProductos, ultimasVentas,
      productosVendidos: pvRow?.total || 0,
      ventasMes, porMetodo
    };
  }

  // ── Facturas Electrónicas ────────────────────────────────
  saveFactura({ ventaId, numero, cufe, qr, pdf }) {
    this.db.run(
      'INSERT INTO facturas_electronicas (venta_id, numero, cufe, qr, pdf_url) VALUES (?,?,?,?,?)',
      [ventaId, numero || '', cufe || '', qr || '', pdf || '']
    );
    this.save();
    return { ok: true };
  }

  // ── Proveedores ───────────────────────────────────────────
  getAllProveedores() {
    return this._all('SELECT * FROM proveedores ORDER BY nombre');
  }

  getProveedorByNit(nit) {
    return this._get('SELECT * FROM proveedores WHERE nit = ?', [nit]);
  }

  saveProveedor(p) {
    if (p.id) {
      this.db.run(
        `UPDATE proveedores SET
          nombre=?, nit=?, tipo_contribuyente=?, responsabilidad_fiscal=?,
          direccion=?, ciudad=?, telefono=?, email=?, contacto=?, notas=?
        WHERE id=?`,
        [
          p.nombre, p.nit || null, p.tipo_contribuyente || null,
          p.responsabilidad_fiscal || null, p.direccion || null,
          p.ciudad || null, p.telefono || null, p.email || null,
          p.contacto || null, p.notas || null, p.id
        ]
      );
      this.save();
      return { id: p.id };
    } else {
      const id = this._run(
        `INSERT INTO proveedores
          (nombre, nit, tipo_contribuyente, responsabilidad_fiscal,
           direccion, ciudad, telefono, email, contacto, notas)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          p.nombre, p.nit || null, p.tipo_contribuyente || null,
          p.responsabilidad_fiscal || null, p.direccion || null,
          p.ciudad || null, p.telefono || null, p.email || null,
          p.contacto || null, p.notas || null
        ]
      );
      return { id };
    }
  }

  deleteProveedor(id) {
    this.db.run('DELETE FROM proveedores WHERE id = ?', [id]);
    this.save();
    return { ok: true };
  }

  close() { if (this.db) this.db.close(); }
}

module.exports = DB;
