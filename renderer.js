'use strict';

// ── Estado global ───────────────────────────────────────
let allProductos = [];
let carrito = [];
let currentCat = 'Todos';
let metodoPago = 'Efectivo';
let dashTab = 'dia';
let lastTicketData = null;
let dashData = null;
let config = {};
let currentUser = null;

// ── Login ────────────────────────────────────────────────
async function doLogin() {
  const user = (document.getElementById('login-user').value || '').trim();
  const pass = (document.getElementById('login-pass').value || '').trim();

  if (!user || !pass) return;

  const btn = document.querySelector('#login-screen button');
  btn.disabled = true;
  btn.textContent = '⏳ Verificando...';

  try {
    // La contraseña se envia en texto plano - el servidor la hashea con bcrypt
    const res = await window.api.auth.login(user, pass);

    if (res.ok) {
      currentUser = res.user;
      document.getElementById('login-error').style.display = 'none';
      const screen = document.getElementById('login-screen');
      screen.classList.add('hidden');
      setTimeout(() => { screen.style.display = 'none'; }, 420);
      
      // Backup automático al entrar
      window.api.auditoria.backup();
    } else {
      document.getElementById('login-error').style.display = 'block';
      document.getElementById('login-error').textContent = '❌ ' + (res.error || 'Acceso denegado');
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  } catch (err) {
    console.error('Error en login:', err);
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('login-error').textContent = '❌ Error de conexión con la base de datos';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔐 Ingresar al Sistema';
  }
}

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    config = await window.api.config.get();
    setDateLabels();
    applyConfig();
    await loadProductos();
    buildCats();
    renderGrid();
    goTo('venta');

    // Enfocar campo usuario del login
    setTimeout(() => {
      const userEl = document.getElementById('login-user');
      if (userEl) userEl.focus();
    }, 300);
  } catch (err) {
    console.error('CRITICAL ERROR ON INIT:', err);
    // Intentar mostrar algo si todo falla
    document.body.innerHTML += `<div style="position:fixed;inset:0;background:red;color:white;padding:2rem;z-index:99999">
      <h1>Error Crítico</h1>
      <pre>${err.stack}</pre>
    </div>`;
  }
});

// ── Fecha ────────────────────────────────────────────────
function setDateLabels() {
  const now = new Date();
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  const el = document.getElementById('sidebar-date');
  if (el) el.textContent = now.toLocaleDateString('es-CO', opts);

  const d2 = document.getElementById('dash-date');
  if (d2) d2.textContent = now.toLocaleDateString('es-CO',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // fecha actual por defecto en historial
  const hf = document.getElementById('hist-fecha');
  if (hf) hf.value = now.toISOString().split('T')[0];
}

// ── Aplicar configuración UI ─────────────────────────────
function applyConfig() {
  const nombre = config.nombre_tienda || 'MiTienda';
  const initials = nombre.trim().charAt(0).toUpperCase();

  const textEls = {
    'sidebar-store-name': nombre,
    'badge-store-name': nombre,
    'sidebar-avatar': initials,
  };
  for (const [id, val] of Object.entries(textEls)) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  const inputEls = {
    'cfg-nombre':            config.nombre_tienda       || '',
    'cfg-propietario':       config.nombre_propietario  || '',
    'cfg-ciudad':            config.ciudad              || '',
    'cfg-telefono':          config.telefono            || '',
    'cfg-nit':               config.nit_tienda          || '',
    'cfg-direccion':         config.direccion_tienda    || '',
    'cfg-resolucion':        config.resolucion_dian     || '',
    'cfg-num-factura':       config.num_factura_fisica  || '1',
    'cfg-factus-id':         config.factus_client_id    || '',
  };
  for (const [id, val] of Object.entries(inputEls)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // Select tipo contribuyente
  const tipoEl = document.getElementById('cfg-tipo-contribuyente');
  if (tipoEl) tipoEl.value = config.tipo_contribuyente || 'Persona Natural';

  // Toggle responsable IVA
  const ivaToggle = document.getElementById('cfg-responsable-iva');
  if (ivaToggle) ivaToggle.checked = config.responsable_iva === '1';

  // Toggle Matias
  const matiasToggle = document.getElementById('cfg-matias-activo');
  const matiasFields = document.getElementById('matias-fields');
  if (matiasToggle) {
    matiasToggle.checked = config.matias_activo === '1';
    if (matiasFields) matiasFields.style.display = matiasToggle.checked ? 'flex' : 'none';
  }

  // Credenciales de acceso
  const loginUsuarioEl = document.getElementById('cfg-login-usuario');
  if (loginUsuarioEl) loginUsuarioEl.value = config.login_usuario_last || 'admin';
}


// ═══════════════════════════════════════════════════════
//  NAVEGACIÓN
// ═══════════════════════════════════════════════════════
async function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');

  if (page === 'dashboard')   { dashData = await window.api.ventas.getDashboard(); renderDashboard(); }
  if (page === 'inventario')  renderInventario();
  if (page === 'historial')   await loadHistorial();
  if (page === 'config')      applyConfig();
  if (page === 'proveedores') { await loadProveedores(); renderProveedores(); }
}

//  PRODUCTOS
async function loadProductos() {
  allProductos = await window.api.productos.getAll();
}

function buildCats() {
  const cats = ['Todos', ...new Set(allProductos.map(p => p.categoria))];
  const bar = document.getElementById('cats-bar');
  bar.innerHTML = cats.map(c =>
    `<button class="cat-btn ${c === currentCat ? 'active' : ''}" onclick="setCat('${c}')">${c}</button>`
  ).join('');
}

function setCat(cat) { currentCat = cat; buildCats(); renderGrid(); }

function filtrarProductos() { renderGrid(); }

function getFiltered() {
  const q = (document.getElementById('buscar').value || '').toLowerCase();
  let list = allProductos;
  if (currentCat !== 'Todos') list = list.filter(p => p.categoria === currentCat);
  if (q) list = list.filter(p =>
    p.nombre.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
  );
  return list;
}

function renderGrid() {
  const grid = document.getElementById('prod-grid');
  const list = getFiltered();
  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text2);padding:2.5rem">Sin resultados</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="prod-card ${p.stock <= 0 ? 'sin-stock' : ''}"
         onclick="${p.stock > 0 ? `agregarAlCarrito(${p.id})` : ''}">
      <div class="prod-emoji">${p.emoji || '🛍️'}</div>
      <div class="prod-nombre">${p.nombre}</div>
      <div class="prod-precio">${fmt(p.precio)}</div>
      <div class="prod-stock-badge">Stock: ${p.stock}</div>
    </div>
  `).join('');
}

// ─── Escáner de código de barras ─────────────────────────
function onBarcodeKey(e) {
  if (e.key === 'Enter') {
    const query = document.getElementById('buscar').value.trim();
    if (query) procesarBarcode(query);
  }
}

async function procesarBarcode(code) {
  let prod = await window.api.productos.getByBarcode(code);
  if (!prod) prod = allProductos.find(p => p.nombre.toLowerCase() === code.toLowerCase());

  if (prod) {
    agregarAlCarrito(prod.id);
    showScanFlash(prod);
    document.getElementById('buscar').value = '';
    filtrarProductos();
  } else {
    mostrarFormularioProductoDesconocido(code);
    document.getElementById('buscar').value = '';
  }
}

function mostrarFormularioProductoDesconocido(barcode) {
  const overlay = document.getElementById('unknown-prod-overlay');
  if (overlay) {
    document.getElementById('unknown-barcode-display').textContent = barcode || '(sin codigo)';
    document.getElementById('unknown-precio').value = '';
    document.getElementById('unknown-precio').focus();
    overlay.style.display = 'flex';
    return;
  }

  const div = document.createElement('div');
  div.id = 'unknown-prod-overlay';
  div.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(4px)';
  div.innerHTML = `
    <div style="background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--radius);padding:2rem;width:90%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem">
        <span style="font-size:1.5rem">📦</span>
        <div>
          <h2 style="font-size:1rem;font-weight:700;margin:0;color:var(--text)">Producto desconocido</h2>
          <p style="font-size:.75rem;color:var(--text2);margin:.2rem 0 0">Codigo: <span id="unknown-barcode-display" style="font-family:monospace;color:var(--accent)">${barcode || '(sin codigo)'}</span></p>
        </div>
      </div>
      <p style="font-size:.8rem;color:var(--text2);margin:0 0 1rem">Se creara como <strong>"Varios"</strong> en la categoria General</p>
      <label style="font-size:.75rem;font-weight:600;color:var(--text2);display:block;margin-bottom:.3rem">Precio de venta</label>
      <input id="unknown-precio" type="number" placeholder="Ej: 5000" style="width:100%;padding:.6rem .8rem;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:1.1rem;font-weight:700;font-family:var(--font);color:var(--text);background:var(--bg3);outline:none;margin-bottom:1rem;box-sizing:border-box" />
      <div style="display:flex;gap:.6rem">
        <button id="unknown-cancel" style="flex:1;padding:.6rem;background:var(--bg3);border:1.5px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:.85rem;cursor:pointer;color:var(--text2)">Cancelar</button>
        <button id="unknown-confirm" style="flex:2;padding:.6rem;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);font-family:var(--font);font-size:.85rem;font-weight:700;cursor:pointer">Agregar y Vender</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  const close = () => { div.style.display = 'none'; };
  document.getElementById('unknown-cancel').onclick = close;
  div.onclick = (e) => { if (e.target === div) close(); };

  document.getElementById('unknown-confirm').onclick = async () => {
    const precio = parseInt(document.getElementById('unknown-precio').value) || 0;
    if (precio <= 0) { showToast('Ingrese un precio valido', 'error'); return; }

    try {
      const nuevoProd = {
        nombre: 'Varios',
        precio,
        stock: 0,
        categoria: 'General',
        barcode: barcode || null,
        emoji: '📦',
        costo: 0,
        iva: 0,
        impoconsumo: 0,
      };
      const res = await window.api.productos.save(nuevoProd);
      const prodCreado = { id: res.id || ('tmp_' + Date.now()), ...nuevoProd };
      allProductos.push(prodCreado);
      agregarAlCarrito(prodCreado.id);
      close();
      showToast('Producto agregado como Varios', 'success');
    } catch (err) {
      showToast('Error al crear producto', 'error');
    }
  };

  document.getElementById('unknown-precio').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('unknown-confirm').click();
  });
  document.getElementById('unknown-precio').focus();
}

function showScanFlash(prod, errorCode) {
  let flash = document.getElementById('scan-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = 'scan-flash';
    const style = document.createElement('style');
    style.textContent = `
      #scan-flash {
        position: absolute; top: 52px; left: 0; right: 0;
        z-index: 100; padding: .7rem 1rem;
        display: flex; align-items: center; gap: .75rem;
        animation: flashIn .18s ease;
        border-bottom: 1px solid var(--border);
        transition: opacity .3s ease;
      }
      #scan-flash.ok  { background: rgba(34,197,94,.12); }
      #scan-flash.err { background: rgba(239,68,68,.10); }
      #scan-flash .sf-emoji { font-size: 1.9rem; }
      #scan-flash .sf-nombre { font-size: .88rem; font-weight: 700; color: var(--text); flex:1; }
      #scan-flash .sf-precio {
        font-size: 1.3rem; font-weight: 900;
        color: var(--green); white-space: nowrap;
      }
      #scan-flash .sf-precio.err { color: var(--red); font-size:.85rem; }
      @keyframes flashIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    `;
    document.head.appendChild(style);
    document.querySelector('.carrito-card').style.position = 'relative';
    document.querySelector('.carrito-card').appendChild(flash);
  }

  clearTimeout(flash._timer);

  if (prod) {
    flash.className = 'ok';
    flash.innerHTML = `
      <div class="sf-emoji">${prod.emoji || '🛍️'}</div>
      <div class="sf-nombre">${prod.nombre}</div>
      <div class="sf-precio">${fmt(prod.precio)}</div>
    `;
  } else {
    flash.className = 'err';
    flash.innerHTML = `
      <div class="sf-emoji">❌</div>
      <div class="sf-nombre">Código no encontrado</div>
      <div class="sf-precio err">${errorCode}</div>
    `;
  }

  flash.style.opacity = '1';
  flash._timer = setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 320);
  }, 2200);
}

//  CARRITO
function agregarAlCarrito(id) {
  const prod = allProductos.find(p => p.id === id);
  if (!prod || prod.stock <= 0) return;

  const exist = carrito.find(i => i.id === id);
  if (exist) {
    if (exist.cantidad >= prod.stock) { showToast('⚠️ Stock máximo alcanzado', 'info'); return; }
    exist.cantidad++;
    exist.subtotal = exist.cantidad * exist.precio;
  } else {
    carrito.push({ id: prod.id, nombre: prod.nombre, precio: prod.precio, emoji: prod.emoji || '🛍️', cantidad: 1, subtotal: prod.precio });
  }
  renderCarrito();
  updateNavBadge();
}

function cambiarCantidad(id, delta) {
  const idx = carrito.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = carrito[idx];
  const newQ = item.cantidad + delta;
  if (newQ <= 0) { carrito.splice(idx, 1); }
  else {
    const prod = allProductos.find(p => p.id === id);
    if (prod && newQ > prod.stock) { showToast('⚠️ Stock insuficiente', 'info'); return; }
    item.cantidad = newQ;
    item.subtotal = newQ * item.precio;
  }
  renderCarrito();
  updateNavBadge();
}

function limpiarCarrito() {
  carrito = [];
  document.getElementById('pago-input').value = '';
  renderCarrito();
  updateNavBadge();
}

function updateNavBadge() {
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  const badge = document.getElementById('nav-badge-carrito');
  if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = total; }
  else badge.style.display = 'none';
}

function toggleProductGrid() {
  const panel = document.getElementById('prod-panel');
  const btn = document.getElementById('browse-btn');
  if (!panel) return;
  panel.classList.toggle('open');
  if (btn) btn.classList.toggle('active', panel.classList.contains('open'));
  setTimeout(() => { const b = document.getElementById('buscar'); if (b) b.focus(); }, 320);
}

function renderCarrito() {
  const cont = document.getElementById('carrito-items');
  if (!carrito.length) {
    cont.innerHTML = `
      <div class="empty-cart-new">
        <div class="empty-art">📡</div>
        <p>Esperando escaneo...</p>
        <small>Apunta el lector al código de barras del producto</small>
      </div>`;
    updateTotales(); return;
  }

  cont.innerHTML = carrito.map(item => `
    <div class="cart-item">
      <div class="ci-emoji">${item.emoji}</div>
      <div class="ci-info">
        <div class="ci-nombre">${item.nombre}</div>
        <div class="ci-precio">${fmt(item.precio)} c/u</div>
      </div>
      <div class="ci-qty">
        <button class="qty-btn" onclick="cambiarCantidad(${item.id},-1)">−</button>
        <span class="qty-num">${item.cantidad}</span>
        <button class="qty-btn" onclick="cambiarCantidad(${item.id},1)">+</button>
      </div>
      <div class="ci-sub">${fmt(item.subtotal)}</div>
    </div>
  `).join('');
  updateTotales();
}

function updateTotales() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const fmtTotal = fmt(total);
  const subtotalEl = document.getElementById('subtotal-val');
  const totalEl = document.getElementById('total-val');
  const cobrarBadge = document.getElementById('cobrar-total-badge');
  const countBadge = document.getElementById('carrito-count');
  if (subtotalEl) subtotalEl.textContent = fmtTotal;
  if (totalEl) totalEl.textContent = fmtTotal;
  if (cobrarBadge) cobrarBadge.textContent = fmtTotal;
  if (countBadge) countBadge.textContent = carrito.reduce((s, i) => s + i.cantidad, 0);
  calcCambio();
}

function calcCambio() {
  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  const pago = parseFloat(document.getElementById('pago-input').value) || 0;
  const cambio = pago - total;
  const el = document.getElementById('cambio-val');
  el.textContent = cambio >= 0 ? fmt(cambio) : '-';
  el.style.color = cambio >= 0 ? 'var(--green)' : 'var(--red)';
}

function setMetodo(btn) {
  document.querySelectorAll('.metodo-btn, .metodo-btn-new').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  metodoPago = btn.dataset.m;

  const pb = document.getElementById('pago-block');
  if (pb) pb.style.display = metodoPago === 'Efectivo' ? 'block' : 'none';
}

//  COBRAR
async function cobrar() {
  if (!carrito.length) { showToast('El carrito está vacío', 'error'); return; }

  const total = carrito.reduce((s, i) => s + i.subtotal, 0);
  let pago = total; // para métodos no-efectivo
  let cambio = 0;

  if (metodoPago === 'Efectivo') {
    pago = parseFloat(document.getElementById('pago-input').value) || 0;
    cambio = pago - total;
    if (pago < total) {
      showToast('❌ El pago es menor al total', 'error');
      document.getElementById('pago-input').focus();
      return;
    }
  }

  const itemsConImpuestos = carrito.map(item => {
    // Buscar impuestos del producto (si existen en el objeto item, o buscar en allProductos)
    const prodRef = allProductos.find(p => p.id === item.id) || {};
    const iva = parseFloat(prodRef.iva || 0);
    const impoconsumo = parseFloat(prodRef.impoconsumo || 0);
    
    const factorImpuesto = 1 + (iva / 100) + (impoconsumo / 100);
    const precioBase = item.precio / factorImpuesto;
    
    return {
      ...item,
      iva,
      impoconsumo,
      iva_monto: precioBase * (iva / 100) * item.cantidad,
      impoconsumo_monto: precioBase * (impoconsumo / 100) * item.cantidad,
      subtotal_sin_impuestos: precioBase * item.cantidad
    };
  });

  const subtotal_ventas = itemsConImpuestos.reduce((s, i) => s + i.subtotal_sin_impuestos, 0);
  const iva_total = itemsConImpuestos.reduce((s, i) => s + i.iva_monto, 0);
  const impoconsumo_total = itemsConImpuestos.reduce((s, i) => s + i.impoconsumo_monto, 0);

  const venta = { 
    items: itemsConImpuestos, 
    total, 
    pago, 
    cambio, 
    metodoPago,
    subtotal_ventas,
    iva_total,
    impoconsumo_total
  };

  try {
    // Obtener número de factura física consecutivo
    const numFactura = await window.api.config.nextNumFacturaFisica();

    const res = await window.api.ventas.registrar(venta);

    // Actualizar stock local
    for (const item of carrito) {
      const prod = allProductos.find(p => p.id === item.id);
      if (prod) prod.stock -= item.cantidad;
    }

    lastTicketData = { ...venta, ventaId: res.ventaId, fecha: new Date(), numFactura };
    // Mantener en sync el config local
    config.num_factura_fisica = String(numFactura + 1);

    // Si Matias está activo, preguntar si quiere factura electrónica
    if (config.matias_activo === '1' && config.matias_base_url) {
      limpiarCarrito();
      renderGrid();
      showToast('Venta registrada', 'success');
      abrirModalFE();
    } else {
      mostrarTicket(lastTicketData);
      limpiarCarrito();
      renderGrid();
      showToast('Venta registrada exitosamente', 'success');
    }
  } catch (err) {
    showToast(' Error al registrar la venta', 'error');
    console.error(err);
  }
}


// ═══════════════════════════════════════════════════════
//  TICKET / FACTURA FÍSICA
// ═══════════════════════════════════════════════════════
function mostrarTicket(data) {
  const { items, total, pago, cambio, metodoPago: mp, fecha, numFactura } = data;
  const fechaStr = (fecha || new Date()).toLocaleString('es-CO',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Encabezado vendedor ──────────────────────────────
  const storeName  = config.nombre_tienda    || 'MiTienda';
  const propietario = config.nombre_propietario || '';
  const nit        = config.nit_tienda        || '';
  const direccion  = config.direccion_tienda  || '';
  const ciudad     = config.ciudad            || '';
  const tel        = config.telefono          || '';
  const resolucion = config.resolucion_dian   || '';
  const tipoContr  = config.tipo_contribuyente || '';
  const respIva    = config.responsable_iva === '1';

  const el = id => document.getElementById(id);
  el('tk-store-name').textContent   = storeName;
  el('tk-propietario').textContent  = propietario ? `Propietario: ${propietario}` : '';
  el('tk-nit').textContent          = nit ? `NIT: ${nit}` : '';
  el('tk-direccion').textContent    = direccion;
  el('tk-ciudad-tel').textContent   = [ciudad, tel ? `Tel: ${tel}` : ''].filter(Boolean).join(' · ');
  el('tk-resolucion').textContent   = resolucion;

  // ── Número y fecha ───────────────────────────────────
  const prefijo = config.prefijo_dian || config.prefijo_factura || 'SETT';
  let cleanNum = numFactura;
  if (typeof cleanNum === 'string') {
    const cleanPref = prefijo.trim().toUpperCase();
    const cleanVal = cleanNum.trim().toUpperCase();
    if (cleanVal.startsWith(cleanPref)) {
      cleanNum = cleanNum.trim().substring(cleanPref.length).trim();
    }
  }
  const numStr = cleanNum ? String(cleanNum).padStart(5, '0') : '—';
  el('tk-num-fecha').innerHTML = `
    <div class="tk-nf-row"><span>Factura N°</span><strong>${numStr}</strong></div>
    <div class="tk-nf-row"><span>Fecha</span><span>${fechaStr}</span></div>
  `;

  // ── Comprador (se llena si el usuario ingresó datos) ─
  const buyerNum    = el('tk-buyer-num')?.value.trim()    || '';
  const buyerNombre = el('tk-buyer-nombre')?.value.trim() || '';
  const buyerTipo   = el('tk-buyer-tipo')?.value          || 'CC';
  const buyerSec    = el('tk-comprador-section');
  const buyerDiv    = el('tk-comprador');
  if (buyerNum || buyerNombre) {
    buyerSec.style.display = 'block';
    buyerDiv.innerHTML = `
      <div class="tk-nf-row"><span>Comprador</span><span>${buyerNombre || '—'}</span></div>
      <div class="tk-nf-row"><span>${buyerTipo}</span><span>${buyerNum}</span></div>
    `;
  } else {
    buyerSec.style.display = 'none';
  }

  // ── Ítems con precio unitario ────────────────────────
  el('ticket-items').innerHTML = items.map(i => `
    <div class="t-item-3col">
      <span class="t-desc">${i.emoji ? i.emoji + ' ' : ''}${i.nombre}<br>
        <small style="color:var(--text3)">x${i.cantidad}</small>
        ${i.iva > 0 ? `<br><small style="color:var(--text3)">>>> IVA ${i.iva}% &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Math.round(i.iva_monto).toLocaleString('es-CO')}</small>` : ''}
      </span>
      <span class="t-unit">${fmt(i.precio)}</span>
      <span class="t-sub">${fmt(i.subtotal)}</span>
    </div>
  `).join('');

  const ivasList = items.filter(i => i.iva > 0).reduce((acc, curr) => {
    if (!acc[curr.iva]) acc[curr.iva] = { compra: 0, base: 0, valor: 0 };
    acc[curr.iva].compra += curr.subtotal;
    acc[curr.iva].base += curr.subtotal_sin_impuestos;
    acc[curr.iva].valor += curr.iva_monto;
    return acc;
  }, {});
  const ivaResumenHtml = Object.keys(ivasList).map(tarifa => {
    const d = ivasList[tarifa];
    return `<div style="display:flex;justify-content:space-between;font-size:0.8em;margin-top:0.1rem">
      <span style="flex:1">${tarifa}%</span>
      <span style="flex:1;text-align:right">${Math.round(d.compra).toLocaleString('es-CO')}</span>
      <span style="flex:1;text-align:right">${Math.round(d.base).toLocaleString('es-CO')}</span>
      <span style="flex:1;text-align:right">${Math.round(d.valor).toLocaleString('es-CO')}</span>
    </div>`;
  }).join('');

  // ── Totales ──────────────────────────────────────────
  el('ticket-totales').innerHTML = `
    <div class="t-totales">
      <div class="t-total-row"><span>SUBTOTAL</span><span>${fmt(total)}</span></div>
      <div class="t-total-row main"><span>TOTAL A PAGAR</span><span>${fmt(total)}</span></div>
      ${mp === 'Efectivo' ? `
        <div class="t-total-row"><span>Efectivo recibido</span><span>${fmt(pago)}</span></div>
        <div class="t-total-row"><span>Cambio</span><span>${fmt(cambio)}</span></div>
      ` : `<div class="t-total-row"><span>- FORMA DE PAGO</span><span>${mp}</span></div>`}
      
      <div class="t-sep">─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
      <div class="t-total-row"><span>Total antes de impuestos</span><span>${fmt(data.subtotal_ventas || total)}</span></div>
      ${(data.iva_total || 0) > 0 ? `<div class="t-total-row"><span>IVA Total</span><span>${fmt(data.iva_total)}</span></div>` : ''}
      ${(data.impoconsumo_total || 0) > 0 ? `<div class="t-total-row"><span>Impoconsumo</span><span>${fmt(data.impoconsumo_total)}</span></div>` : ''}
      
      ${(data.iva_total || 0) > 0 ? `
      <div class="t-sep">─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
      <div style="text-align:center;font-size:0.85em;margin-top:0.3rem">RESUMEN DE IVA</div>
      <div style="display:flex;justify-content:space-between;font-size:0.8em;color:var(--text2);margin-top:0.2rem">
        <span style="flex:1">COMPRA</span>
        <span style="flex:1;text-align:right">BASE</span>
        <span style="flex:1;text-align:right">VALOR</span>
      </div>
      ${ivaResumenHtml}
      ` : ''}
    </div>
  `;

  // ── Nota IVA ─────────────────────────────────────────
  el('tk-iva-nota').textContent = respIva
    ? `${tipoContr} — Responsable de IVA`
    : `${tipoContr}${tipoContr ? ' — ' : ''}No responsable de IVA`;

  el('ticket-metodo').textContent = '';

  // Limpiar form comprador para la próxima venta
  if (el('tk-buyer-num'))    el('tk-buyer-num').value    = '';
  if (el('tk-buyer-nombre')) el('tk-buyer-nombre').value = '';

  openOverlay('modal-ticket');
}

function closeTicket() { closeOverlay('modal-ticket'); }

async function imprimirTicket() {
  if (!lastTicketData) return;

  const { items, total, pago, cambio, metodoPago: mp, fecha, numFactura } = lastTicketData;
  const fechaStr    = (fecha || new Date()).toLocaleString('es-CO');
  const storeName   = config.nombre_tienda        || 'MiTienda';
  const propietario = config.nombre_propietario   || '';
  const nit         = config.nit_tienda           || '';
  const direccion   = config.direccion_tienda     || '';
  const ciudad      = config.ciudad               || '';
  const tel         = config.telefono             || '';
  const resolucion  = config.resolucion_dian      || '';
  const tipoContr   = config.tipo_contribuyente   || '';
  const respIva     = config.responsable_iva === '1';

  const buyerNum    = document.getElementById('tk-buyer-num')?.value.trim()    || '';
  const buyerNombre = document.getElementById('tk-buyer-nombre')?.value.trim() || '';
  const buyerTipo   = document.getElementById('tk-buyer-tipo')?.value          || 'CC';

  const prefijo = config.prefijo_dian || config.prefijo_factura || 'SETT';
  let cleanNum = numFactura;
  if (typeof cleanNum === 'string') {
    const cleanPref = prefijo.trim().toUpperCase();
    const cleanVal = cleanNum.trim().toUpperCase();
    if (cleanVal.startsWith(cleanPref)) {
      cleanNum = cleanNum.trim().substring(cleanPref.length).trim();
    }
  }
  const numStr = cleanNum ? String(cleanNum).padStart(5, '0') : '';

  const html = `<html><head>
    <meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 302px; margin: 0 auto; padding: 4px; }
      .center  { text-align: center; }
      .titulo  { text-align: center; font-size: 13px; font-weight: 900; letter-spacing: .08em; margin: 6px 0 2px; }
      .store   { text-align: center; font-size: 14px; font-weight: 900; margin: 2px 0; }
      .sub     { text-align: center; font-size: 10px; color: #444; margin: 1px 0; }
      .sep     { text-align: center; color: #bbb; margin: 4px 0; font-size: 11px; }
      .row2    { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
      .row3    { display: flex; font-size: 11px; margin: 2px 0; }
      .row3 .desc { flex: 1; }
      .row3 .unit { width: 68px; text-align: right; }
      .row3 .sub  { width: 68px; text-align: right; }
      .hdr3    { display: flex; font-size: 10px; font-weight: 700; border-bottom: 1px dashed #ccc; padding-bottom: 2px; margin-bottom: 3px; }
      .hdr3 .desc { flex: 1; }
      .hdr3 .unit, .hdr3 .sub { width: 68px; text-align: right; }
      .total-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11.5px; }
      .total-main{ font-weight: 900; font-size: 13px; }
      .nota-iva  { text-align: center; font-size: 9.5px; color: #555; margin: 4px 0; }
      .footer    { text-align: center; margin-top: 6px; font-size: 10px; color: #666; }
      .res       { text-align: center; font-size: 9px; color: #888; font-style: italic; margin: 2px 0; }
    </style></head><body>
    <div class="titulo">DOCUMENTO EQUIVALENTE ELECTRÓNICO POS</div>
    <div class="store">${storeName}</div>
    ${propietario ? `<div class="sub">${propietario}</div>` : ''}
    ${nit         ? `<div class="sub">NIT: ${nit}</div>` : ''}
    ${direccion   ? `<div class="sub">${direccion}</div>` : ''}
    ${ciudad || tel ? `<div class="sub">${[ciudad, tel ? 'Tel: ' + tel : ''].filter(Boolean).join(' · ')}</div>` : ''}
    ${config.resolucion_dian ? `<div class="res">Resolución DIAN N° ${config.resolucion_dian} Prefijo: ${prefijo} Habilitada del ${config.rango_inicio || '1'} al ${config.rango_fin || '10000'} ${config.resolucion_vigencia ? `<br>Vigencia: ${config.resolucion_vigencia}` : ''}</div>` : ''}

    <div class="sep">──────────────────────</div>
    ${numStr ? `<div class="row2"><span>Factura N°</span><strong>${config.prefijo_dian || config.prefijo_factura || ''}${numStr}</strong></div>` : ''}
    <div class="row2"><span>Fecha</span><span>${fechaStr}</span></div>

    ${(buyerNum || buyerNombre) ? `
    <div class="sep">──────────────────────</div>
    <div class="row2"><span>Comprador</span><span>${buyerNombre || '—'}</span></div>
    <div class="row2"><span>${buyerTipo}</span><span>${buyerNum}</span></div>
    ` : ''}

    ${lastTicketData.qr ? `
    <div class="sep">──────────────────────</div>
    <div class="center" style="margin: 6px 0;">
      <img src="${lastTicketData.qr}" style="width: 120px; height: 120px; display: block; margin: 0 auto;" />
    </div>
    ` : ''}

    <div class="sep">──────────────────────</div>
    <div class="hdr3">
      <span class="desc">Descripción</span>
      <span class="unit">Vr.Unit</span>
      <span class="sub">Total</span>
    </div>
    ${items.map(i => `
      <div class="row3">
        <span class="desc">${i.nombre}<br>
        <small style="color:#888">x${i.cantidad}</small>
        ${i.iva > 0 ? `<br><small style="color:#888">>>> IVA ${i.iva}% &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${Math.round(i.iva_monto).toLocaleString('es-CO')}</small>` : ''}
        </span>
        <span class="unit">$${Math.round(i.precio).toLocaleString('es-CO')}</span>
        <span class="sub">$${Math.round(i.subtotal).toLocaleString('es-CO')}</span>
      </div>
    `).join('')}
    <div class="sep">──────────────────────</div>
    <div class="total-row"><span>SUBTOTAL</span><span>$${Math.round(total).toLocaleString('es-CO')}</span></div>
    <div class="total-row total-main"><span>TOTAL A PAGAR</span><span>$${Math.round(total).toLocaleString('es-CO')}</span></div>
    ${mp === 'Efectivo' ? `
      <div class="total-row"><span>Efectivo</span><span>$${Math.round(pago).toLocaleString('es-CO')}</span></div>
      <div class="total-row"><span>Cambio</span><span>$${Math.round(cambio).toLocaleString('es-CO')}</span></div>
    ` : `<div class="total-row"><span>- FORMA DE PAGO</span><span>${mp}</span></div>`}
    
    <div class="sep">──────────────────────</div>
    <div class="total-row"><span>Total antes de impuestos</span><span>$${Math.round(lastTicketData.subtotal_ventas || total).toLocaleString('es-CO')}</span></div>
    ${(lastTicketData.iva_total || 0) > 0 ? `<div class="total-row"><span>IVA Total</span><span>$${Math.round(lastTicketData.iva_total).toLocaleString('es-CO')}</span></div>` : ''}
    ${(lastTicketData.impoconsumo_total || 0) > 0 ? `<div class="total-row"><span>Impoconsumo</span><span>$${Math.round(lastTicketData.impoconsumo_total).toLocaleString('es-CO')}</span></div>` : ''}
    
    ${(lastTicketData.iva_total || 0) > 0 ? `
    <div class="sep">──────────────────────</div>
    <div class="center" style="font-size:10px;margin-top:4px">RESUMEN DE IVA</div>
    <div class="row3" style="font-size:9.5px;color:#555;margin-top:2px">
      <span style="flex:1">COMPRA</span>
      <span style="flex:1;text-align:right">BASE</span>
      <span style="flex:1;text-align:right">VALOR</span>
    </div>
    ${Object.keys(
      items.filter(i => i.iva > 0).reduce((acc, curr) => {
        if (!acc[curr.iva]) acc[curr.iva] = { compra: 0, base: 0, valor: 0 };
        acc[curr.iva].compra += curr.subtotal;
        acc[curr.iva].base += curr.subtotal_sin_impuestos;
        acc[curr.iva].valor += curr.iva_monto;
        return acc;
      }, {})
    ).map(tarifa => {
      const d = items.filter(i => i.iva > 0).reduce((acc, curr) => {
        if (!acc[curr.iva]) acc[curr.iva] = { compra: 0, base: 0, valor: 0 };
        acc[curr.iva].compra += curr.subtotal;
        acc[curr.iva].base += curr.subtotal_sin_impuestos;
        acc[curr.iva].valor += curr.iva_monto;
        return acc;
      }, {})[tarifa];
      return `<div class="row3" style="font-size:9.5px;margin-top:1px">
        <span style="flex:1">${tarifa}%</span>
        <span style="flex:1;text-align:right">${Math.round(d.compra).toLocaleString('es-CO')}</span>
        <span style="flex:1;text-align:right">${Math.round(d.base).toLocaleString('es-CO')}</span>
        <span style="flex:1;text-align:right">${Math.round(d.valor).toLocaleString('es-CO')}</span>
      </div>`;
    }).join('')}
    ` : ''}
    <div class="sep">──────────────────────</div>
    <div class="nota-iva">${respIva
      ? `${tipoContr} — Responsable de IVA`
      : `${tipoContr}${tipoContr ? ' — ' : ''}No responsable de IVA`}</div>
    ${lastTicketData.cufe ? `<div class="nota-iva" style="margin-top:2px; font-size:7px; word-break:break-all;"><b>CUFE/CUDE:</b><br>${lastTicketData.cufe}</div>` : ''}
    <div class="nota-iva" style="margin-top:4px; font-size:8.5px;">Autoriza el tratamiento de sus datos personales<br>bajo la Ley 1581 de 2012.</div>
    <div class="nota-iva" style="margin-top:4px; font-size:8px;">MiTienda POS - Desarrollado por Sebastian Agudelo Muñoz - NIT: 1000292576-3</div>
    <div class="footer">¡Gracias por su compra!</div>
    </body></html>`;

  const result = await window.api.print.ticket(html);
  if (result?.success) { showToast('🖨️ Imprimiendo...', 'info'); closeTicket(); }
  else showToast('⚠️ Verifica la impresora', 'error');
}



//  DASHBOARD
function setDashTab(tab) {
  dashTab = tab;
  document.getElementById('tab-dia').classList.toggle('active', tab === 'dia');
  document.getElementById('tab-mes').classList.toggle('active', tab === 'mes');
  renderDashboard();
}

function renderDashboard() {
  if (!dashData) return;
  const isMes = dashTab === 'mes';

  document.getElementById('s-total').textContent = fmt(isMes ? (dashData.ventas_mes || 0) : (dashData.ventas_total || 0));
  document.getElementById('s-trans').textContent = isMes ? (dashData.transacciones_mes || 0) : (dashData.transacciones || 0);
  document.getElementById('s-prods').textContent = dashData.productosVendidos || 0;
  document.getElementById('s-avg').textContent = fmt(isMes ? (dashData.ticket_mes || 0) : (dashData.ticket_promedio || 0));
  document.getElementById('s-total-lbl').textContent = isMes ? 'Ventas del Mes' : 'Ventas del Día';
  document.getElementById('s-trans-lbl').textContent = isMes ? 'Trans. del Mes' : 'Trans. del Día';
  document.getElementById('s-avg-lbl').textContent = isMes ? 'Ticket Promedio Mes' : 'Ticket Promedio';

  const graficaSec = document.getElementById('grafica-mes-section');
  const metodosSec = document.getElementById('metodos-hoy-section');
  const lastSec = document.getElementById('last-section');
  graficaSec.style.display = isMes ? 'block' : 'none';
  metodosSec.style.display = 'grid';
  lastSec.style.display = isMes ? 'none' : 'grid';

  if (isMes && dashData.ventasMes) renderChartMes(dashData.ventasMes);

  // Métodos de pago
  const metodosEl = document.getElementById('metodos-hoy');
  const metIcon = { 'Efectivo': '💵', 'Transferencia': '📲', 'Débito': '💳', 'Crédito': '🏦' };
  if (dashData.porMetodo && dashData.porMetodo.length) {
    metodosEl.innerHTML = dashData.porMetodo.map(m => `
      <div class="metodo-row">
        <span class="metodo-icon">${metIcon[m.metodo_pago] || '💰'}</span>
        <span class="metodo-name">${m.metodo_pago}</span>
        <span class="metodo-cnt">${m.cnt} venta${m.cnt !== 1 ? 's' : ''}</span>
        <span class="metodo-total">${fmt(m.total)}</span>
      </div>`).join('');
  } else {
    metodosEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin ventas hoy</p>`;
  }

  // Top productos
  const topEl = document.getElementById('top-prods');
  if (dashData.topProductos && dashData.topProductos.length) {
    topEl.innerHTML = dashData.topProductos.map((p, i) => `
      <div class="top-item">
        <span class="top-rank">#${i + 1}</span>
        <span class="top-name">${p.nombre}</span>
        <span class="top-qty">${p.qty} uds</span>
      </div>`).join('');
  } else {
    topEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin datos</p>`;
  }

  // Últimas ventas
  const lastEl = document.getElementById('last-sales');
  const badges = { 'Efectivo': 'ef', 'Transferencia': 'tr', 'Débito': 'db', 'Crédito': 'cr' };
  if (dashData.ultimasVentas && dashData.ultimasVentas.length) {
    lastEl.innerHTML = dashData.ultimasVentas.map(v => {
      const hora = new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const b = badges[v.metodo_pago] || 'ef';
      return `
        <div class="sale-row">
          <span class="sale-time">🕐 ${hora}</span>
          <span class="sale-badge ${b}">${v.metodo_pago || 'Efectivo'}</span>
          <span class="sale-amount">${fmt(v.total)}</span>
        </div>`;
    }).join('');
  } else {
    lastEl.innerHTML = `<p style="color:var(--text2);font-size:.83rem;padding:.4rem 0">Sin ventas hoy</p>`;
  }
}

// ── Gráfica de barras
function renderChartMes(datos) {
  const canvas = document.getElementById('chart-mes');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth || 600;
  const H = 160;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0, 0, W, H);

  if (!datos.length) {
    ctx.fillStyle = '#7a80a0';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos para este mes', W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(...datos.map(d => d.total_dia), 1);
  const pad = 32;
  const barW = Math.max(8, (W - pad * 2) / datos.length - 4);
  const gap = (W - pad * 2 - barW * datos.length) / Math.max(datos.length - 1, 1);

  datos.forEach((d, i) => {
    const barH = ((d.total_dia / maxVal) * (H - pad - 20)) || 4;
    const x = pad + i * (barW + gap);
    const y = H - pad - barH;

    const grad = ctx.createLinearGradient(0, y, 0, H - pad);
    grad.addColorStop(0, 'rgba(99,102,241,.85)');
    grad.addColorStop(1, 'rgba(99,102,241,.2)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 3);
    ctx.fill();

    // Día
    const dia = d.dia?.split('-')[2] || '';
    ctx.fillStyle = '#7a80a0';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dia, x + barW / 2, H - 10);
  });

  ctx.fillStyle = '#7a80a0';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(fmt(maxVal), pad - 4, 16);
}

//  INVENTARIO
function filtrarInv() { renderInventario(); }

function renderInventario() {
  const q = (document.getElementById('inv-buscar')?.value || '').toLowerCase();
  const list = allProductos.filter(p =>
    !q || p.nombre.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.categoria || '').toLowerCase().includes(q)
  );

  const tbody = document.getElementById('inv-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:2.5rem">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    let badge = p.stock <= 0 ? 'badge-empty' : p.stock < 5 ? 'badge-low' : 'badge-ok';
    let btext = p.stock <= 0 ? 'Sin stock' : p.stock < 5 ? 'Bajo' : 'OK';
    return `
      <tr>
        <td style="font-size:1.5rem;text-align:center">${p.emoji || '🛍️'}</td>
        <td style="font-weight:600">${p.nombre}</td>
        <td><span style="color:var(--text2);font-size:.82rem">${p.categoria}</span></td>
        <td><span style="color:var(--text3);font-size:.78rem;font-family:monospace">${p.barcode || '—'}</span></td>
        <td style="font-weight:800;color:var(--accent2)">${fmt(p.precio)}</td>
        <td style="font-weight:700">${p.stock}</td>
        <td><span class="badge ${badge}">${btext}</span></td>
        <td>
          <button class="btn-table" onclick="editarProducto(${p.id})">✏️ Editar</button>
          <button class="btn-table danger" onclick="eliminarProducto(${p.id},'${p.nombre.replace(/'/g, '')}')">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

// ── CRUD Producto ─────────────────────────────────────────
function calcPrecioSugerido() {
  const costo = parseFloat(document.getElementById('p-costo').value) || 0;
  const iva = parseFloat(document.getElementById('p-iva').value) || 0;
  const imp = parseFloat(document.getElementById('p-impoconsumo').value) || 0;
  const util = parseFloat(document.getElementById('p-utilidad').value) || 0;

  const costoImp = costo * (1 + iva / 100 + imp / 100);
  const sugerido = costoImp * (1 + util / 100);
  document.getElementById('p-precio-sugerido').textContent = fmt(sugerido);
}

function openModal(prod) {
  document.getElementById('p-id').value = prod?.id || '';
  document.getElementById('p-nombre').value = prod?.nombre || '';
  document.getElementById('p-costo').value = prod?.costo || '';
  document.getElementById('p-iva').value = prod?.iva || '0';
  document.getElementById('p-impoconsumo').value = prod?.impoconsumo || '';
  document.getElementById('p-precio').value = prod?.precio || '';
  document.getElementById('p-stock').value = prod?.stock || '';
  document.getElementById('p-cat').value = prod?.categoria || 'General';
  document.getElementById('p-emoji').value = prod?.emoji || '';
  document.getElementById('p-barcode').value = prod?.barcode || '';
  document.getElementById('modal-title').textContent = prod ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('p-utilidad').value = '15';
  calcPrecioSugerido();
  document.getElementById('ai-sugerencia').style.display = 'none';
  document.getElementById('ai-badge').style.display = 'none';
  openOverlay('modal-prod');
  setTimeout(() => document.getElementById('p-nombre').focus(), 100);
}

function closeModal() { closeOverlay('modal-prod'); }

function editarProducto(id) {
  const prod = allProductos.find(p => p.id === id);
  if (prod) openModal(prod);
}

async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    await window.api.productos.delete(id);
    allProductos = allProductos.filter(p => p.id !== id);
    carrito = carrito.filter(i => i.id !== id);
    renderCarrito();
    buildCats();
    renderGrid();
    renderInventario();
    showToast('🗑 Producto eliminado', 'info');
  } catch (err) {
    showToast('❌ Error al eliminar', 'error');
  }
}

async function guardarProducto() {
  const nombre = document.getElementById('p-nombre').value.trim();
  const costo = parseFloat(document.getElementById('p-costo').value) || 0;
  const iva = parseFloat(document.getElementById('p-iva').value) || 0;
  const impoconsumo = parseFloat(document.getElementById('p-impoconsumo').value) || 0;
  const precio = parseFloat(document.getElementById('p-precio').value);
  const stock = parseInt(document.getElementById('p-stock').value);
  const cat = document.getElementById('p-cat').value;
  const emoji = document.getElementById('p-emoji').value.trim() || '🛍️';
  const barcode = document.getElementById('p-barcode').value.trim() || null;
  const id = document.getElementById('p-id').value;

  if (!nombre) { showToast('⚠️ Ingresa el nombre', 'error'); return; }
  if (isNaN(precio)) { showToast('⚠️ Precio inválido', 'error'); return; }
  if (isNaN(stock)) { showToast('⚠️ Stock inválido', 'error'); return; }

  const prod = { nombre, precio, stock, categoria: cat, emoji, barcode, costo, iva, impoconsumo, ...(id ? { id: parseInt(id) } : {}) };

  try {
    const res = await window.api.productos.save(prod);
    if (!id) prod.id = res.id;
    const idx = allProductos.findIndex(p => p.id === prod.id);
    if (idx >= 0) allProductos[idx] = prod; else allProductos.push(prod);

    closeModal();
    buildCats();
    renderGrid();
    renderInventario();
    showToast(id ? '✅ Producto actualizado' : '✅ Producto agregado', 'success');
  } catch (err) {
    showToast('❌ Error: ' + (err.message || ''), 'error');
  }
}

//   IA LOCAL – Detectar categoría y emoji por nombre del producto
const AI_REGLAS = [
  // ── Bebidas ────────────────────────────────────────────────────────────────
  {
    re: /gaseosa|cola|pepsi|sprite|malt|soda|refresc|fanta|seven.?up|7.?up|postobón|postobon|bretaña/i,
    emoji: '🥤', cat: 'Bebidas'
  },
  { re: /agua\b|water|brisa\b|cristal\b|manantial/i, emoji: '💧', cat: 'Bebidas' },
  {
    re: /café|tinto|coffee|cappuccino|latte|nescafé|nescafe|colcafé|colcafe|sello rojo|aguila roja/i,
    emoji: '☕', cat: 'Bebidas'
  },
  {
    re: /jugo|juice|limonada|maracuy|néctar|nectar|hit\b|frutiño|fruti.?no|tang\b|avena\b|tutti.?frutti/i,
    emoji: '🧃', cat: 'Bebidas'
  },
  {
    re: /pony.?malt|ponny|gatorade|powerade|squash|electrolit|mr\.?\s?tea|nestea/i,
    emoji: '🧉', cat: 'Bebidas'
  },
  {
    re: /cerveza|beer|aguardiente|ron\b|whisky|vodka|vino\b|licor|alcohol|poker\b|águila\b|costeña|club\b|pilsen/i,
    emoji: '🍺', cat: 'Licores'
  },
  { re: /bon.?ice|bon bon|paleta|helado|yogurt.?helado|ice.?cream/i, emoji: '🍦', cat: 'Snacks' },

  // ── Lácteos ────────────────────────────────────────────────────────────────
  {
    re: /leche|milk|yogur|yoghurt|alpina|alquería|colanta|klim\b|carnation|condensad/i,
    emoji: '🥛', cat: 'Lácteos'
  },
  { re: /queso|mantequilla|crema\s*(de\s*(leche|mesa)|agria)|butter|kumis/i, emoji: '🧀', cat: 'Lácteos' },
  { re: /huevo|egg/i, emoji: '🥚', cat: 'Lácteos' },
  { re: /milo\b|nestl[eé]|chocolisto|cocoa|ovomaltina/i, emoji: '🍫', cat: 'Bebidas' },

  // ── Panadería ──────────────────────────────────────────────────────────────
  {
    re: /pan\b|arepa|torta|galleta|bizcocho|buñuelo|pandebono|croissant|mogolla|almojábana|roscón|donuts?/i,
    emoji: '🍞', cat: 'Panadería'
  },

  // ── Snacks ─────────────────────────────────────────────────────────────────
  {
    re: /papa frita|papas\s*(fritas)?|snack|chito|doritos|tostitos|maní|nuez|chips|yupi\b|margarita\b|pringles|cheetos|ruffles|lays\b/i,
    emoji: '🍟', cat: 'Snacks'
  },
  {
    re: /chocolat|dulce|caramelo|bombon|golosina|chicle|goma.?de.?mascar|trident|halls\b|jet\b|confite|bon bon bum/i,
    emoji: '🍫', cat: 'Snacks'
  },
  { re: /maruchan|ramen|sopa.?(sobre|china)|sopas\b/i, emoji: '🍜', cat: 'General' },

  // ── Aseo del hogar ─────────────────────────────────────────────────────────
  {
    re: /fabuloso|limpido|ajax\b|poett|pinesol|pine.?sol|glorix|vim\b|cif\b|señor\s*aseo|limpiador|multiusos/i,
    emoji: '🧹', cat: 'Aseo'
  },
  {
    re: /jabón\s*(de\s*barra|de\s*baño|de\s*ropa)?|detergent|fab\b|ariel\b|rinso|omo\b|bold\b|rindex|nevex|marea\b|su.?fresh/i,
    emoji: '🧼', cat: 'Aseo'
  },
  { re: /suavizant|suavitel|downy|vanish|quitamanchas|viaclean|vel\s*rosa/i, emoji: '🧺', cat: 'Aseo' },
  { re: /desinfect|lysol|hipoclorito|cloro|blanqueador|virex/i, emoji: '🧪', cat: 'Aseo' },
  { re: /lavaplatos?|axion\b|lavaloza|ajax\s*(crema|líquido)/i, emoji: '🍽️', cat: 'Aseo' },

  // ── Aseo personal ──────────────────────────────────────────────────────────
  {
    re: /shampoo|champú|acondicionad|tío\s*nacho|tio\s*nacho|pantene|sedal|head.?shoulders|elvive|savital|konzil/i,
    emoji: '🧴', cat: 'Aseo'
  },
  {
    re: /crema\s*(corporal|facial|de\s*manos)|nivea|dove\b|pond[s']|vaselina|lubriderm/i,
    emoji: '🧴', cat: 'Aseo'
  },
  {
    re: /desodorante|axe\b|rexona|speed\s*stick|lady\s*speed|brut\b|old\s*spice|secret\b/i,
    emoji: '🌸', cat: 'Aseo'
  },
  {
    re: /pasta\s*dental|crema\s*dental|colgate|cepillo\s*dental|enjuague\s*bucal|oral.?b|listerine/i,
    emoji: '🦷', cat: 'Aseo'
  },
  {
    re: /papel\s*higi[eé]nico|servilleta|pañal|toall|paño|familia\b|elite\b|scottex|winny\b|huggies|pampers/i,
    emoji: '🧻', cat: 'Aseo'
  },
  { re: /toalla\s*(sanitaria|femenina)|nosotras|stayfree|carefree\b/i, emoji: '🌸', cat: 'Aseo' },
  { re: /afeitar|gillette|mach.?3|schick|crema\s*de\s*afeitar/i, emoji: '🪒', cat: 'Aseo' },

  // ── Frutas y Verduras ──────────────────────────────────────────────────────
  {
    re: /tomate|lechuga|cebolla|zanahoria|pepino|brócoli|brocoli|espinaca|col\b|repollo|apio/i,
    emoji: '🍅', cat: 'Frutas y Verduras'
  },
  {
    re: /limón|naranja|mango|banano|piña|mora\b|fresa|uva\b|manzana|pera\b|papaya|melón|guayaba/i,
    emoji: '🍋', cat: 'Frutas y Verduras'
  },
  { re: /yuca|papa\b|plátano|ñame|remolacha|ahuyama|mazorca/i, emoji: '🌽', cat: 'Frutas y Verduras' },

  // ── Granos y Abarrotes ────────────────────────────────────────────────────
  {
    re: /arroz|frijol|lenteja|garbanzo|maíz|maiz|pasta\b|fideo|harina|avena\b(?!.*bebida)/i,
    emoji: '🌾', cat: 'General'
  },
  {
    re: /aceite|vinagre|sal\b|azúcar|azucar|pimienta|salsa|comino|condiment|maggi\b|knorr|cubito/i,
    emoji: '🫙', cat: 'General'
  },
  { re: /atún|sardina/i, emoji: '🐟', cat: 'Carnes' },

  // ── Carnes ─────────────────────────────────────────────────────────────────
  {
    re: /carne|pollo|res\b|cerdo|pescado|chorizo|salchicha|mortadela|salchichon|jamon|jamón/i,
    emoji: '🥩', cat: 'Carnes'
  },

  // ── Licores y tabaco ──────────────────────────────────────────────────────
  { re: /cigarrill|tabaco|vapeador|marlboro|derby\b|mustang\b|pielroja/i, emoji: '🚬', cat: 'General' },

  // ── Hogar y otros ──────────────────────────────────────────────────────────
  { re: /pilas?|batería\b|foco|vela\b|encendedor|fosforo|fósforo|cerillo/i, emoji: '🔋', cat: 'General' },
  { re: /bolsa|bolsas|basura|ziploc|rollo\s*(de\s*(cocina|papel))?/i, emoji: '🛍️', cat: 'General' },
  { re: /insecticida|raid\b|baygon|off\b|matainsectos|repelente/i, emoji: '🐛', cat: 'General' },
  { re: /esponja|estropajo|bayeta|mechudo|trapeador|escoba|recogedor/i, emoji: '🧽', cat: 'Aseo' },
];


let aiDebounce = null;

function aiDetectarCategoria() {
  clearTimeout(aiDebounce);
  aiDebounce = setTimeout(() => {
    const nombre = document.getElementById('p-nombre').value.trim();
    const sugerEl = document.getElementById('ai-sugerencia');
    const badgeEl = document.getElementById('ai-badge');

    if (nombre.length < 3) { sugerEl.style.display = 'none'; badgeEl.style.display = 'none'; return; }

    const match = AI_REGLAS.find(r => r.re.test(nombre));
    if (match) {
      sugerEl.style.display = 'flex';
      badgeEl.style.display = 'inline-block';
      sugerEl.innerHTML = `✨ <b>IA sugiere:</b>&nbsp; ${match.emoji} &nbsp;<b>${match.cat}</b> – <u>Aceptar</u>`;
      sugerEl.onclick = () => {
        document.getElementById('p-emoji').value = match.emoji;
        document.getElementById('p-cat').value = match.cat;
        sugerEl.style.display = 'none';
        showToast(`✨ Categoría asignada: ${match.cat}`, 'info');
      };
    } else {
      sugerEl.style.display = 'none';
      badgeEl.style.display = 'none';
    }
  }, 350);
}

//  HISTORIAL
async function loadHistorial() {
  const fecha = document.getElementById('hist-fecha').value || null;
  const ventas = await window.api.ventas.getHistorial(fecha);
  renderHistorial(ventas);
}

async function filtrarHist() { await loadHistorial(); }

function renderHistorial(ventas) {
  const cont = document.getElementById('historial-lista');
  if (!ventas.length) {
    cont.innerHTML = `<div class="hist-empty">📋 No hay ventas en este período</div>`;
    return;
  }
  const mIcon = { 'Efectivo': '💵', 'Transferencia': '📲', 'Débito': '💳', 'Crédito': '🏦' };
  cont.innerHTML = ventas.map(v => {
    const fechaStr = new Date(v.fecha).toLocaleString('es-CO',
      { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    const isFEActivo = config.matias_activo === '1';
    let feHtml = '';
    if (isFEActivo) {
      if (v.cufe) {
        feHtml = `<span style="font-size:.75rem; color:var(--success); font-weight:600">✅ FE Emitida</span>`;
      } else {
        feHtml = `<button class="btn-primary" style="padding: 3px 8px; font-size: .75rem" onclick="reemitirVenta(${v.id})">Emitir DIAN</button>`;
      }
    }

    return `
      <div class="hist-item">
        <div>
          <div style="font-weight:700;font-size:.88rem">#${v.id} &nbsp;${mIcon[v.metodo_pago] || '💰'} ${v.metodo_pago || 'Efectivo'}</div>
          <div class="hist-fecha">${fechaStr}</div>
          <div style="margin-top:4px">${feHtml}</div>
        </div>
        <div class="hist-resumen">${v.resumen || '—'}</div>
        <div style="text-align:right">
          <div class="hist-total">${fmt(v.total)}</div>
          ${v.metodo_pago === 'Efectivo' ? `<div style="font-size:.73rem;color:var(--text2)">Cambio: ${fmt(v.cambio)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

window.reemitirVenta = async (id) => {
  try {
    const venta = await window.api.ventas.get(id);
    if (!venta) return;
    
    // Simulate lastTicketData
    lastTicketData = {
      ventaId: venta.id,
      items: venta.items,
      total: venta.total,
      pago: venta.pago,
      cambio: venta.cambio,
      metodoPago: venta.metodo_pago
    };
    
    abrirModalFE();
  } catch (err) {
    showToast('Error al cargar la venta', 'error');
  }
};

async function exportCSV() {
  const ventas = await window.api.ventas.getAll();
  if (!ventas.length) { showToast('Sin datos para exportar', 'info'); return; }

  const header = 'ID,Fecha,Total,Pago,Cambio,Método,Items\n';
  const rows = ventas.map(v =>
    `${v.id},"${v.fecha}",${v.total},${v.pago},${v.cambio},"${v.metodo_pago || 'Efectivo'}","${v.resumen || ''}"`
  ).join('\n');

  const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ CSV exportado', 'success');
}

async function exportarInventarioCSV() {
  if (!allProductos || !allProductos.length) { showToast('Sin datos para exportar', 'info'); return; }
  const header = 'ID,Nombre,Categoría,Precio,Stock,Código de Barras\n';
  const rows = allProductos.map(p =>
    `${p.id},"${p.nombre}","${p.categoria}",${p.precio},${p.stock},"${p.barcode || ''}"`
  ).join('\n');
  const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `inventario_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Inventario exportado', 'success');
}

async function exportarProveedoresCSV() {
  if (!allProveedores || !allProveedores.length) { showToast('Sin datos para exportar', 'info'); return; }
  const header = 'ID,Nombre,NIT,Tipo,Ciudad,Teléfono,Email\n';
  const rows = allProveedores.map(p =>
    `${p.id},"${p.nombre}","${p.nit || ''}","${p.tipo_contribuyente || ''}","${p.ciudad || ''}","${p.telefono || ''}","${p.email || ''}"`
  ).join('\n');
  const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `proveedores_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Proveedores exportados', 'success');
}

//  CONFIGURACIÓN
async function guardarConfig() {
  const responsableIva = document.getElementById('cfg-responsable-iva')?.checked ? '1' : '0';
  const numFactura     = parseInt(document.getElementById('cfg-num-factura')?.value || '1', 10);

  const campos = {
    nombre_tienda:       document.getElementById('cfg-nombre').value.trim(),
    nombre_propietario:  document.getElementById('cfg-propietario').value.trim(),
    ciudad:              document.getElementById('cfg-ciudad').value.trim(),
    telefono:            document.getElementById('cfg-telefono').value.trim(),
    nit_tienda:          document.getElementById('cfg-nit')?.value.trim() || '',
    direccion_tienda:    document.getElementById('cfg-direccion')?.value.trim() || '',
    resolucion_dian:     document.getElementById('cfg-resolucion')?.value.trim() || '',
    tipo_contribuyente:  document.getElementById('cfg-tipo-contribuyente')?.value || 'Persona Natural',
    responsable_iva:     responsableIva,
    num_factura_fisica:  String(isNaN(numFactura) ? 1 : numFactura),
  };

  if (!campos.nombre_tienda) { showToast('⚠️ Ingresa el nombre de la tienda', 'error'); return; }

  try {
    for (const [k, v] of Object.entries(campos)) {
      await window.api.config.set(k, v);
      config[k] = v;
    }
    applyConfig();
    showToast('✅ Configuración guardada', 'success');
  } catch (err) {
    showToast('❌ Error al guardar', 'error');
  }
}


//  MATIAS API – Configuración
function toggleMatias(checkbox) {
  const fields = document.getElementById('matias-fields');
  fields.style.display = checkbox.checked ? 'flex' : 'none';
  window.api.config.set('matias_activo', checkbox.checked ? '1' : '0');
  config.matias_activo = checkbox.checked ? '1' : '0';
}

async function guardarConfigMatias() {
  const baseUrl = document.getElementById('cfg-matias-base-url').value.trim();
  const token = document.getElementById('cfg-matias-token').value.trim();
  const softwareId = document.getElementById('cfg-matias-software-id').value.trim();
  const softwarePin = document.getElementById('cfg-matias-software-pin').value.trim();
  const prefijoDian = document.getElementById('cfg-prefijo-dian').value.trim();

  if (!baseUrl || !token) { showToast('⚠️ Ingresa Base URL y Token', 'error'); return; }

  await window.api.config.set('matias_base_url', baseUrl);
  await window.api.config.set('matias_token', token);
  await window.api.config.set('matias_software_id', softwareId);
  await window.api.config.set('matias_software_pin', softwarePin);
  await window.api.config.set('prefijo_dian', prefijoDian);

  config.matias_base_url = baseUrl;
  config.matias_token = token;
  config.matias_software_id = softwareId;
  config.matias_software_pin = softwarePin;
  config.prefijo_dian = prefijoDian;

  showToast('✅ Credenciales guardadas', 'success');
}

// ── Credenciales de login ────────────────────────────────
async function guardarCredenciales() {
  const usuario = (document.getElementById('cfg-login-usuario').value || '').trim();
  const pass1 = document.getElementById('cfg-login-pass1').value;
  const pass2 = document.getElementById('cfg-login-pass2').value;
  const msgEl = document.getElementById('cfg-login-msg');

  if (!usuario) {
    msgEl.style.display = 'block';
    msgEl.style.background = 'rgba(220,38,38,0.1)';
    msgEl.style.color = 'var(--red)';
    msgEl.style.border = '1px solid rgba(220,38,38,0.2)';
    msgEl.textContent = '⚠️ El usuario no puede estar vacío.';
    return;
  }
  if (pass1 && (pass1 !== pass2 || pass1.length < 4)) {
    msgEl.style.display = 'block';
    msgEl.style.background = 'rgba(220,38,38,0.1)';
    msgEl.style.color = 'var(--red)';
    msgEl.style.border = '1px solid rgba(220,38,38,0.2)';
    msgEl.textContent = pass1.length < 4 ? '⚠️ La contraseña debe tener al menos 4 caracteres.' : '⚠️ Las contraseñas no coinciden.';
    return;
  }

  try {
    if (pass1) {
      const passHash = await hashPassword(pass1);
      await window.api.auth.changePassword(usuario, passHash);
    }
    
    // También guardamos el usuario en config por conveniencia para el input de login
    await window.api.config.set('login_usuario_last', usuario);
    config.login_usuario_last = usuario;

    document.getElementById('cfg-login-pass1').value = '';
    document.getElementById('cfg-login-pass2').value = '';

    msgEl.style.display = 'block';
    msgEl.style.background = 'rgba(22,163,74,0.1)';
    msgEl.style.color = 'var(--green)';
    msgEl.style.border = '1px solid rgba(22,163,74,0.2)';
    msgEl.textContent = '✅ Credenciales actualizadas correctamente.';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  } catch (err) {
    console.error('Error al guardar credenciales:', err);
    showToast('❌ Error al actualizar seguridad', 'error');
  }
}

async function verificarMatias() {
  const statusEl = document.getElementById('matias-status');
  statusEl.style.display = 'block';
  statusEl.className = 'matias-status';
  statusEl.textContent = '⏳ Verificando conexión...';

  // Guardar primero
  await guardarConfigMatias();

  const res = await window.api.matias.verificar();
  if (res.ok) {
    statusEl.className = 'matias-status ok';
    statusEl.textContent = '✅ Conexión exitosa con Matias API';
    showToast('✅ Matias conectado correctamente', 'success');
  } else {
    statusEl.className = 'matias-status err';
    statusEl.textContent = '❌ Error: ' + (res.error || 'Credenciales inválidas');
  }
}

// ═══════════════════════════════════════════════════════
//  FACTUS – Emisión de Factura Electrónica
// ═══════════════════════════════════════════════════════
function abrirModalFE() {
  // Limpiar campos
  const ids = ['fe-identificacion', 'fe-nombre', 'fe-email'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('fe-tipo').value = 'CC';
  document.getElementById('fe-error').style.display = 'none';
  openOverlay('modal-fe');
}

async function emitirFEComun(cliente) {
  const btn = document.getElementById('fe-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Emitiendo...'; }

  const errEl = document.getElementById('fe-error');
  errEl.style.display = 'none';

  try {
    const items = lastTicketData.items.map(i => ({
      nombre: i.nombre,
      precio: i.precio,
      cantidad: i.cantidad,
      subtotal: i.subtotal,
    }));

    const res = await window.api.matias.emitir({
      ventaId: lastTicketData.ventaId,
      items,
      total: lastTicketData.total,
      metodoPago: lastTicketData.metodoPago,
      cliente,
    });

    if (res.ok) {
      closeOverlay('modal-fe');
      lastTicketData.cufe = res.cufe;
      lastTicketData.qr = res.qr;
      lastTicketData.pdf = res.pdf;
      mostrarTicketConCUFE(lastTicketData, res);
      showToast('✅ Factura electrónica emitida', 'success');
    } else {
      errEl.style.display = 'block';
      errEl.textContent = '❌ ' + (res.error || 'Error al emitir');
    }
  } catch (err) {
    errEl.style.display = 'block';
    errEl.textContent = '❌ Error: ' + (err.message || '');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧾 Emitir Factura'; }
  }
}

function emitirFEConsumidor() {
  emitirFEComun({
    tipo: 'NIT',
    identificacion: '222222222222',
    nombre: 'Consumidor Final',
    email: '',
    telefono: '',
  });
}

function emitirFECliente() {
  const tipo = document.getElementById('fe-tipo').value;
  const identificacion = document.getElementById('fe-identificacion').value.trim();
  const nombre = document.getElementById('fe-nombre').value.trim();
  const email = document.getElementById('fe-email').value.trim();

  if (!identificacion) {
    document.getElementById('fe-error').style.display = 'block';
    document.getElementById('fe-error').textContent = '⚠️ Ingresa el número de documento';
    return;
  }

  emitirFEComun({ tipo, identificacion, nombre: nombre || 'Cliente', email, telefono: '' });
}

// ── Ticket con CUFE y QR ─────────────────────────────────
function mostrarTicketConCUFE(ticketData, feData) {
  const { items, total, pago, cambio, metodoPago: mp, fecha } = ticketData;
  const fechaStr = (fecha || new Date()).toLocaleString('es-CO',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const storeName = config.nombre_tienda || 'MiTienda POS';
  document.getElementById('tk-store-name').textContent = '🛒 ' + storeName;
  document.getElementById('ticket-fecha').textContent = fechaStr;
  document.getElementById('ticket-metodo').textContent = 'Pago: ' + (mp || 'Efectivo');

  document.getElementById('ticket-items').innerHTML = items.map(i =>
    `<div class="t-item"><span>${i.emoji || ''} ${i.nombre} x${i.cantidad}</span><span>${fmt(i.subtotal)}</span></div>`
  ).join('');

  const cufeShort = feData.cufe ? feData.cufe.slice(0, 20) + '...' : '';

  document.getElementById('ticket-totales').innerHTML = `
    <div class="t-totales">
      <div class="t-total-row main"><span>TOTAL</span><span>${fmt(total)}</span></div>
      ${mp === 'Efectivo' ? `
        <div class="t-total-row"><span>Pago</span><span>${fmt(pago)}</span></div>
        <div class="t-total-row"><span>Cambio</span><span>${fmt(cambio)}</span></div>
      ` : ''}
      <div style="margin-top:.5rem;padding:.4rem;background:#f5f5f5;border-radius:4px;font-size:.7rem;color:#555;text-align:left">
        <div style="font-weight:700;margin-bottom:.2rem">📋 FACTURA ELECTRÓNICA</div>
        <div>No. FE-${feData.numero || ''}</div>
        <div style="word-break:break-all">CUFE: ${cufeShort}</div>
        ${feData.pdf ? `<div style="margin-top:.2rem"><a href="${feData.pdf}" style="color:#6366f1">Ver factura PDF</a></div>` : ''}
      </div>
    </div>
  `;
  openOverlay('modal-ticket');
}


// ═══════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════
function fmt(n) {
  return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }
function overlayClose(e, id) { if (e.target.id === id) closeOverlay(id); }

// Escape cierra modales
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeOverlay('modal-prod');
    closeOverlay('modal-ticket');
    closeOverlay('modal-scan-factura');
    closeOverlay('modal-proveedor');
  }
});


// ═══════════════════════════════════════════════════════
//  PROVEEDORES
// ═══════════════════════════════════════════════════════

let allProveedores = [];
let proveedorEscaneado = null;  // datos extraídos del último escaneo

// ── Cargar y renderizar ──────────────────────────────────
async function loadProveedores() {
  allProveedores = await window.api.proveedores.getAll();
}

function filtrarProveedores() { renderProveedores(); }

function renderProveedores() {
  const q = (document.getElementById('prov-buscar')?.value || '').toLowerCase();
  const list = q
    ? allProveedores.filter(p =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.nit || '').includes(q) ||
        (p.ciudad || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    : allProveedores;

  const tbody       = document.getElementById('prov-tbody');
  const emptyDiv    = document.getElementById('prov-empty');
  const tablaWrap   = document.getElementById('prov-tabla-wrap');

  if (!allProveedores.length) {
    emptyDiv.style.display  = 'flex';
    tablaWrap.style.display = 'none';
    return;
  }

  emptyDiv.style.display  = 'none';
  tablaWrap.style.display = 'block';

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:2rem">Sin resultados para "${q}"</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const tipoColor = {
      'Persona Natural': '#22c55e',
      'Persona Jurídica': '#6366f1',
      'Gran Contribuyente': '#f59e0b',
      'Régimen Simple': '#06b6d4',
    }[p.tipo_contribuyente] || '#7a80a0';
    return `
      <tr>
        <td>
          <div style="font-weight:700;font-size:.9rem">${p.nombre}</div>
          ${p.responsabilidad_fiscal ? `<div style="font-size:.73rem;color:var(--text3)">${p.responsabilidad_fiscal}</div>` : ''}
        </td>
        <td><span style="font-family:monospace;font-size:.82rem;color:var(--text2)">${p.nit || '—'}</span></td>
        <td>
          ${p.tipo_contribuyente
            ? `<span class="badge" style="background:${tipoColor}22;color:${tipoColor};border:1px solid ${tipoColor}44;font-size:.72rem">${p.tipo_contribuyente}</span>`
            : '<span style="color:var(--text3);font-size:.82rem">—</span>'}
        </td>
        <td><span style="color:var(--text2);font-size:.84rem">${p.ciudad || '—'}</span></td>
        <td><span style="font-size:.84rem">${p.telefono || '—'}</span></td>
        <td><a href="mailto:${p.email || ''}" style="color:var(--accent);font-size:.82rem;text-decoration:none">${p.email || '—'}</a></td>
        <td>
          <button class="btn-table" onclick="editarProveedor(${p.id})">✏️ Editar</button>
          <button class="btn-table danger" onclick="eliminarProveedor(${p.id},'${(p.nombre || '').replace(/'/g, '')}')">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

// ── Modal CRUD ───────────────────────────────────────────
function openModalProveedor(prov) {
  document.getElementById('prov-id').value                = prov?.id || '';
  document.getElementById('prov-nombre').value            = prov?.nombre || '';
  document.getElementById('prov-nit').value               = prov?.nit || '';
  document.getElementById('prov-tipo').value              = prov?.tipo_contribuyente || '';
  document.getElementById('prov-resp-fiscal').value       = prov?.responsabilidad_fiscal || '';
  document.getElementById('prov-telefono').value          = prov?.telefono || '';
  document.getElementById('prov-email').value             = prov?.email || '';
  document.getElementById('prov-direccion').value         = prov?.direccion || '';
  document.getElementById('prov-ciudad').value            = prov?.ciudad || '';
  document.getElementById('prov-contacto').value          = prov?.contacto || '';
  document.getElementById('prov-notas').value             = prov?.notas || '';
  document.getElementById('prov-modal-title').textContent = prov ? 'Editar Proveedor' : 'Nuevo Proveedor';
  openOverlay('modal-proveedor');
  setTimeout(() => document.getElementById('prov-nombre').focus(), 100);
}

function editarProveedor(id) {
  const prov = allProveedores.find(p => p.id === id);
  if (prov) openModalProveedor(prov);
}

async function eliminarProveedor(id, nombre) {
  if (!confirm(`¿Eliminar el proveedor "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    await window.api.proveedores.delete(id);
    allProveedores = allProveedores.filter(p => p.id !== id);
    renderProveedores();
    showToast('🗑 Proveedor eliminado', 'info');
  } catch (err) {
    showToast('❌ Error al eliminar proveedor', 'error');
  }
}

async function guardarProveedor() {
  const nombre = document.getElementById('prov-nombre').value.trim();
  if (!nombre) { showToast('⚠️ El nombre es obligatorio', 'error'); return; }

  const id = document.getElementById('prov-id').value;
  const prov = {
    nombre,
    nit:                    document.getElementById('prov-nit').value.trim() || null,
    tipo_contribuyente:     document.getElementById('prov-tipo').value || null,
    responsabilidad_fiscal: document.getElementById('prov-resp-fiscal').value.trim() || null,
    telefono:               document.getElementById('prov-telefono').value.trim() || null,
    email:                  document.getElementById('prov-email').value.trim() || null,
    direccion:              document.getElementById('prov-direccion').value.trim() || null,
    ciudad:                 document.getElementById('prov-ciudad').value.trim() || null,
    contacto:               document.getElementById('prov-contacto').value.trim() || null,
    notas:                  document.getElementById('prov-notas').value.trim() || null,
    ...(id ? { id: parseInt(id) } : {}),
  };

  try {
    const res = await window.api.proveedores.save(prov);
    if (!id) prov.id = res.id;
    const idx = allProveedores.findIndex(p => p.id === prov.id);
    if (idx >= 0) allProveedores[idx] = prov; else allProveedores.push(prov);
    closeOverlay('modal-proveedor');
    renderProveedores();
    showToast(id ? '✅ Proveedor actualizado' : '✅ Proveedor guardado', 'success');
  } catch (err) {
    showToast('❌ Error al guardar: ' + (err.message || ''), 'error');
  }
}

// ── Escaneo de factura ───────────────────────────────────
function openModalScanFactura() {
  proveedorEscaneado = null;
  const input = document.getElementById('scan-factura-input');
  if (input) input.value = '';
  document.getElementById('scan-preview').style.display  = 'none';
  document.getElementById('scan-no-data').style.display  = 'none';
  document.getElementById('scan-foot').style.display     = 'none';
  document.getElementById('sfh-anim').classList.remove('done');
  openOverlay('modal-scan-factura');
  setTimeout(() => { if (input) input.focus(); }, 200);
}

// Se llama en tiempo real al escribir/escanear en el campo
let _scanDebounce = null;
function onScanFacturaInput() {
  clearTimeout(_scanDebounce);
  _scanDebounce = setTimeout(() => {
    const raw = (document.getElementById('scan-factura-input')?.value || '').trim();
    if (!raw) return;
    procesarTextoFactura(raw);
  }, 350); // pequeño debounce por si el escáner envía caracteres en ráfaga
}

/**
 * Parsea el texto crudo de un código de barras o QR de factura colombiana
 * y extrae todos los campos del proveedor que pueda identificar.
 *
 * Formatos soportados:
 *  1. Pipe-separated  → NIT:900123456|Nombre:Dist XYZ|Tel:3001234|Dir:Calle 1
 *  2. Factura DIAN URL → https://...?nit=900123456&razon=...
 *  3. Texto libre      → el parser busca patrones como NIT, email, teléfono, etc.
 *  4. Solo NIT         → string numérico con guión (900123456-1)
 */
function parsearCodigoFactura(raw) {
  const datos = {};

  // ── 1. Formato clave:valor separado por pipes, punto y coma o saltos de línea
  const kvFormats = [
    // NIT o identificacion
    { keys: ['nit', 'identificacion', 'rut', 'cif', 'ruc'], field: 'nit' },
    { keys: ['nombre', 'razon', 'razonsocial', 'empresa', 'emisor', 'name', 'company'], field: 'nombre' },
    { keys: ['dir', 'direccion', 'address'], field: 'direccion' },
    { keys: ['ciudad', 'city', 'municipio'], field: 'ciudad' },
    { keys: ['tel', 'telefono', 'phone', 'fono', 'cel', 'celular'], field: 'telefono' },
    { keys: ['email', 'correo', 'mail'], field: 'email' },
    { keys: ['tipo', 'tipocontribuyente', 'tipopersona'], field: 'tipo_contribuyente' },
    { keys: ['resp', 'responsabilidad', 'regimen', 'regimenfiscal'], field: 'responsabilidad_fiscal' },
  ];

  // Separar por pipe |, punto y coma ;, o coma + espacio para formatos estructurados
  const segments = raw.split(/[|;,\n]+/);
  for (const seg of segments) {
    const colonIdx = seg.indexOf(':');
    if (colonIdx > 0) {
      const key = seg.slice(0, colonIdx).trim().toLowerCase().replace(/[^a-z]/g, '');
      const val = seg.slice(colonIdx + 1).trim();
      for (const kv of kvFormats) {
        if (kv.keys.includes(key) && val && !datos[kv.field]) {
          datos[kv.field] = val;
        }
      }
    }
  }

  // ── 2. Parseo de URL (QR DIAN / Matias con parámetros)
  try {
    let urlStr = raw;
    if (!urlStr.startsWith('http')) urlStr = 'https://x.com/?' + urlStr;
    const url = new URL(urlStr);
    const paramMap = {
      nit: 'nit', identificacion: 'nit', rut: 'nit',
      nombre: 'nombre', razon: 'nombre', razonsocial: 'nombre', name: 'nombre',
      direccion: 'direccion', dir: 'direccion', address: 'direccion',
      ciudad: 'ciudad', city: 'ciudad',
      telefono: 'telefono', tel: 'telefono', phone: 'telefono',
      email: 'email', correo: 'email',
    };
    for (const [param, field] of Object.entries(paramMap)) {
      const v = url.searchParams.get(param);
      if (v && !datos[field]) datos[field] = decodeURIComponent(v);
    }
  } catch (_) { /* no era URL */ }

  // ── 3. Regex sobre el texto libre (detección de patrones colombianos)
  const clean = raw.replace(/\n/g, ' ');

  // NIT: formatos 900.123.456-1 | 9001234561 | NIT 900123456
  if (!datos.nit) {
    const nitMatch =
      clean.match(/\bNIT[:\s.]*([0-9]{6,12}[-–][0-9Xx])\b/i) ||
      clean.match(/\b([0-9]{3,6}[.]?[0-9]{3}[.]?[0-9]{3}[-–][0-9Xx])\b/) ||
      clean.match(/\b([0-9]{9,12})\b/);
    if (nitMatch) datos.nit = nitMatch[1].replace(/\s/g, '');
  }

  // Email
  if (!datos.email) {
    const emailMatch = clean.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) datos.email = emailMatch[0];
  }

  // Teléfono colombiano: 3XX XXX XXXX o 60X XXXXXXX o (60X) ...
  if (!datos.telefono) {
    const telMatch =
      clean.match(/\b(3[0-9]{2}[\s\-]?[0-9]{3}[\s\-]?[0-9]{4})\b/) ||
      clean.match(/\b(60[1-9][\s\-]?[0-9]{7})\b/) ||
      clean.match(/Tel[.:\s]+([0-9()\s\-+]{7,15})/i);
    if (telMatch) datos.telefono = telMatch[1].trim().replace(/\s+/g, ' ');
  }

  // Tipo de persona / contribuyente
  if (!datos.tipo_contribuyente) {
    if (/persona\s*natural/i.test(clean))            datos.tipo_contribuyente = 'Persona Natural';
    else if (/gran\s*contribuyente/i.test(clean))    datos.tipo_contribuyente = 'Gran Contribuyente';
    else if (/r[eé]gimen\s*simple/i.test(clean))    datos.tipo_contribuyente = 'Régimen Simple';
    else if (/persona\s*jur[ií]dica|s\.?a\.?s|ltda|s\.?a\b/i.test(clean)) datos.tipo_contribuyente = 'Persona Jurídica';
  }

  // Responsabilidad fiscal
  if (!datos.responsabilidad_fiscal) {
    const respMatch =
      clean.match(/Responsabilidad\s+Fiscal[:\s]+([^\|;]+)/i) ||
      clean.match(/(responsable\s+de\s+IVA|no\s+responsable\s+de\s+IVA|r[eé]gimen\s+com[uú]n|r[eé]gimen\s+simplificado)/i);
    if (respMatch) datos.responsabilidad_fiscal = respMatch[1].trim();
  }

  // Dirección: buscar patrones comunes colombianos
  if (!datos.direccion) {
    const dirMatch = clean.match(
      /((?:Calle|Carrera|Avenida|Av|Cra|Cl|Transversal|Diagonal|Manzana)[^\|;,\n]{5,50})/i
    );
    if (dirMatch) datos.direccion = dirMatch[1].trim();
  }

  // Ciudad: buscar después de "ciudad:" o nombre de ciudad conocida
  if (!datos.ciudad) {
    const ciudadMatch =
      clean.match(/Ciudad[:\s]+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]{3,30}?)(?:[|;,]|$)/i) ||
      clean.match(/\b(Bogot[áa]|Medell[ií]n|Cali|Barranquilla|Cartagena|C[úu]cuta|Bucaramanga|Manizales|Pereira|Ibagu[eé]|Armenia|Monter[ií]a|Villavicencio|Pasto|Neiva|Popay[aá]n|Santa\s*Marta)\b/i);
    if (ciudadMatch) datos.ciudad = ciudadMatch[1].trim();
  }

  // Nombre de empresa (si no se detectó por clave:valor)
  if (!datos.nombre) {
    // Buscar patrón de razón social: palabras en mayúscula seguido de S.A.S / LTDA / S.A.
    const rsMatch = clean.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{3,40}(?:S\.?A\.?S|LTDA|S\.?A|Y CIA|E\.?U|SAS|LTDA)\.?)/);
    if (rsMatch) datos.nombre = rsMatch[1].trim();
  }

  return datos;
}

function procesarTextoFactura(raw) {
  const datos = parsearCodigoFactura(raw);
  const tieneNombre = datos.nombre && datos.nombre.length > 2;
  const tieneNIT    = datos.nit;
  const tieneDatos  = tieneNombre || tieneNIT || datos.email || datos.telefono || datos.direccion;

  const preview   = document.getElementById('scan-preview');
  const noData    = document.getElementById('scan-no-data');
  const foot      = document.getElementById('scan-foot');
  const sfhAnim   = document.getElementById('sfh-anim');
  const spGrid    = document.getElementById('sp-grid');

  if (tieneDatos) {
    proveedorEscaneado = datos;

    // Construir grid de preview
    const campos = [
      { label: 'Razón Social',             icon: '🏢', val: datos.nombre },
      { label: 'NIT',                       icon: '🔢', val: datos.nit },
      { label: 'Tipo de Contribuyente',     icon: '👤', val: datos.tipo_contribuyente },
      { label: 'Responsabilidad Fiscal',    icon: '📋', val: datos.responsabilidad_fiscal },
      { label: 'Dirección',                 icon: '📍', val: datos.direccion },
      { label: 'Ciudad',                    icon: '🏙️', val: datos.ciudad },
      { label: 'Teléfono',                  icon: '📞', val: datos.telefono },
      { label: 'Email',                     icon: '📧', val: datos.email },
    ].filter(c => c.val);

    spGrid.innerHTML = campos.map(c => `
      <div class="sp-field">
        <span class="sp-icon">${c.icon}</span>
        <div>
          <div class="sp-label">${c.label}</div>
          <div class="sp-val">${c.val}</div>
        </div>
      </div>
    `).join('');

    preview.style.display = 'block';
    noData.style.display  = 'none';
    foot.style.display    = 'flex';
    sfhAnim.classList.add('done');
  } else {
    proveedorEscaneado = null;
    preview.style.display = 'none';
    noData.style.display  = 'flex';
    foot.style.display    = 'none';
    sfhAnim.classList.remove('done');
  }
}

async function confirmarProveedorEscaneado() {
  if (!proveedorEscaneado) return;

  // Si falta el nombre, pedir manualmente
  if (!proveedorEscaneado.nombre) {
    closeOverlay('modal-scan-factura');
    openModalProveedor(proveedorEscaneado);
    showToast('ℹ️ Completa el nombre del proveedor', 'info');
    return;
  }

  try {
    const res = await window.api.proveedores.save(proveedorEscaneado);
    const nuevo = { ...proveedorEscaneado, id: res.id };
    allProveedores.push(nuevo);
    allProveedores.sort((a, b) => a.nombre.localeCompare(b.nombre));
    closeOverlay('modal-scan-factura');
    renderProveedores();
    showToast('✅ Proveedor agregado desde factura', 'success');
    proveedorEscaneado = null;
  } catch (err) {
    showToast('❌ Error al guardar: ' + (err.message || ''), 'error');
  }
}

// Abre el modal de edición pre-cargado con los datos escaneados para corrección
function editarDatosEscaneados() {
  if (!proveedorEscaneado) return;
  closeOverlay('modal-scan-factura');
  openModalProveedor(proveedorEscaneado);
}

// Fallback: abrir el modal de ingreso manual vacío
function ingresarManualmente() {
  closeOverlay('modal-scan-factura');
  openModalProveedor();
}

