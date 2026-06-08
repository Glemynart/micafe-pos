const https = require('https');
const http  = require('http');
const qs    = require('querystring');

/**
 * Cliente para la API v2 de Factus (facturación electrónica Colombia)
 * Sandbox: https://api-sandbox.factus.com.co
 * Producción: https://api.factus.com.co
 */
class FactusClient {
  constructor({ baseUrl, clientId, clientSecret, username, password }) {
    this.baseUrl      = (baseUrl || 'https://api-sandbox.factus.com.co').replace(/\/$/, '');
    this.clientId     = clientId;
    this.clientSecret = clientSecret;
    this.username     = username;
    this.password     = password;

    this._accessToken  = null;
    this._refreshToken = null;
    this._tokenExpiry  = 0; // timestamp ms
  }

  // ── Autenticación OAuth2 (grant_type=password) ─────────────────────────
  async _authenticate() {
    const body = qs.stringify({
      grant_type:    'password',
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      username:      this.username,
      password:      this.password,
    });

    const data = await this._raw('POST', '/oauth/token', body, 'application/x-www-form-urlencoded');
    this._accessToken  = data.access_token;
    this._refreshToken = data.refresh_token;
    // access_token válido 1 hora, lo refrescamos 5 min antes
    this._tokenExpiry  = Date.now() + (data.expires_in || 3600) * 1000 - 300_000;
    return this._accessToken;
  }

  async _refresh() {
    const body = qs.stringify({
      grant_type:    'refresh_token',
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this._refreshToken,
    });

    try {
      const data = await this._raw('POST', '/oauth/token', body, 'application/x-www-form-urlencoded');
      this._accessToken  = data.access_token;
      this._refreshToken = data.refresh_token;
      this._tokenExpiry  = Date.now() + (data.expires_in || 3600) * 1000 - 300_000;
    } catch (_) {
      // Si el refresh falla, hacemos login completo
      await this._authenticate();
    }
  }

  async _getToken() {
    if (!this._accessToken) {
      await this._authenticate();
    } else if (Date.now() >= this._tokenExpiry) {
      await this._refresh();
    }
    return this._accessToken;
  }

  // ── Rangos de numeración disponibles ──────────────────────────────────
  async getRangosNumeracion() {
    const token = await this._getToken();
    return this._request('GET', '/v2/numbering-ranges', null, token);
  }

  // ── Verificar conexión ─────────────────────────────────────────────────
  async verificarCredenciales() {
    try {
      await this.getRangosNumeracion();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Emitir factura electrónica ─────────────────────────────────────────
  async emitirFactura({ numeroFactura, rangoId, cliente, items, total, metodoPago, fecha }) {
    const token = await this._getToken();

    // Construir items con impuestos
    const invoiceItems = items.map((item, idx) => {
      const iva         = parseFloat(item.iva || 0);
      const impo        = parseFloat(item.impoconsumo || 0);
      const cantidad    = parseInt(item.cantidad);
      const factorImp   = 1 + iva / 100 + impo / 100;
      const precioBase  = item.precio / factorImp; // precio sin impuestos
      const price       = parseFloat(precioBase.toFixed(2));
      const baseTotal   = price * cantidad;

      const taxes = [];
      if (iva > 0) {
        taxes.push({
          code:           '01',   // 01 = IVA
          rate:           iva.toFixed(2),
          taxable_amount: baseTotal.toFixed(2),
          tax_amount:     (baseTotal * iva / 100).toFixed(2),
        });
      }
      if (impo > 0) {
        taxes.push({
          code:           '04',   // 04 = INC
          rate:           impo.toFixed(2),
          taxable_amount: baseTotal.toFixed(2),
          tax_amount:     (baseTotal * impo / 100).toFixed(2),
        });
      }

      if (taxes.length === 0) {
        taxes.push({
          code: '01',
          rate: '0.00',
          taxable_amount: baseTotal.toFixed(2),
          tax_amount: '0.00'
        });
      }

      return {
        code_reference:     String(item.barcode || item.codigo || item.id || `P${idx + 1}`),
        name:               item.nombre,
        quantity:           cantidad,
        price:              price,
        discount_rate:      0,
        unit_measure_code:  '94',  // 94 = Unidad (código DIAN)
        standard_code:      '1',   // 1 = Estándar del contribuyente
        is_excluded:        iva === 0 && impo === 0 ? 1 : 0,
        tribute_id:         iva > 0 ? '01' : (impo > 0 ? '04' : '03'),
        withholding_taxes:  [],
        taxes,
      };
    });

    // Calcular el total exacto que resultará de los items para evitar discrepancias de céntimos en el payment_details
    let calculatedTotal = 0;
    invoiceItems.forEach(item => {
      let taxSum = 0;
      item.taxes.forEach(t => {
        taxSum += parseFloat(t.tax_amount);
      });
      calculatedTotal += (item.price * item.quantity) + taxSum;
    });

    const dueDate = fecha || new Date().toISOString().split('T')[0];

    const payload = {
      observation:        'Venta registrada en POS',
      payment_form:       1,
      payment_due_date:   dueDate,
      payment_method_id:  this._metodoCodigo(metodoPago),
      numbering_range_id: parseInt(rangoId),
      reference_code:     numeroFactura,
      payment_details: [
        {
          payment_form:        1,    // 1 = contado
          payment_method_code: String(this._metodoCodigo(metodoPago)),
          amount:              parseFloat(calculatedTotal.toFixed(2)),
        },
      ],
      customer: this._buildCustomerPayload(cliente),
      items: invoiceItems,
    };

    console.log('[Factus] Payload enviado:', JSON.stringify(payload, null, 2));
    const data = await this._raw('POST', '/v2/bills/validate', JSON.stringify(payload), 'application/json', token);
    console.log('[Factus] Respuesta:', JSON.stringify(data, null, 2));

    // Factus v2 devuelve la factura en data.data
    const bill = data.data || data;
    return {
      ok:     true,
      cufe:   bill.cufe || '',
      qr:     (bill.links && bill.links.qr)         || '',
      pdf:    (bill.links && bill.links.public_url) || '',
      numero: bill.number || bill.reference_code    || '',
    };
  }

  // ── Buscar cliente por identificación ─────────────────────────────────
  async buscarCliente(identificacion) {
    const token = await this._getToken();
    try {
      // 1. Intentar buscar en /v2/customers
      return await this._request('GET', `/v2/customers?filter[identification]=${identificacion}`, null, token);
    } catch (err) {
      // Si falla (por ejemplo, con 404 en el ambiente de pruebas), intentamos buscar en el historial de facturas
      console.log(`[Factus] No se encontró /v2/customers (${err.message}). Probando fallback con /v2/bills...`);
      try {
        const res = await this._request('GET', `/v2/bills?filter[identification]=${identificacion}`, null, token);
        const list = res.data?.data || res.data || [];
        if (Array.isArray(list) && list.length > 0) {
          const bill = list[0];
          if (bill && bill.customer) {
            return {
              status: 'OK',
              data: [bill.customer]
            };
          }
        }
      } catch (fallbackErr) {
        console.error('[Factus] Fallback /v2/bills también falló:', fallbackErr.message);
      }
      // Si ambos fallan, devolvemos un objeto vacío para evitar lanzar excepciones en el frontend
      return { status: 'OK', data: [] };
    }
  }

  // ── Obtener siguiente número de factura/nota ───────────────────────────────
  async getSiguienteNumero(rangoId, documentType = 'Factura de Venta') {
    try {
      const rangos = await this.getRangosNumeracion();
      const lista = rangos?.data?.data || rangos?.data || rangos || [];
      if (!Array.isArray(lista) || !lista.length) return { ok: false, error: 'Sin rangos disponibles' };

      let rango;
      if (rangoId) {
        rango = lista.find(r => String(r.id) === String(rangoId));
      } else {
        rango = lista.find(r => r.document === documentType) || lista.find(r => r.document === 'Factura de Venta') || lista[0];
      }

      if (!rango) return { ok: false, error: `Rango para ${documentType} no encontrado` };
      return {
        ok:        true,
        siguiente: rango.current || rango.current_number || rango.next_consecutive,
        prefix:    rango.prefix || '',
        rangoId:   rango.id,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Consultar adquiriente en DIAN (Nombre y Correo) ───────────────────────
  async consultarAdquiriente(tipoDocId, identificacion) {
    try {
      const token = await this._getToken();
      
      // Mapeo del ID interno de Factus al Código de Documento DIAN
      const dianCodeMap = {
        '1': '11', // Registro Civil
        '2': '12', // Tarjeta de Identidad
        '3': '13', // Cédula de Ciudadanía
        '6': '31', // NIT
        '5': '22', // Cédula de Extranjería
        '4': '21', // Tarjeta de Extranjería
        '7': '41', // Pasaporte
        '8': '42', // Documento extranjero
        '9': '47', // PEP
      };
      const dianCode = dianCodeMap[String(tipoDocId)] || '13';
      
      console.log(`[Factus] Consultando DIAN con tipoDocId=${tipoDocId} -> dianCode=${dianCode}, identificacion=${identificacion}`);
      // Factus API: /v2/dian/acquirer?identification_document_code=X&identification_number=Y
      const res = await this._request('GET', `/v2/dian/acquirer?identification_document_code=${dianCode}&identification_number=${identificacion}`, null, token);
      return res; // Retorna { status: 'OK', data: { name: '...', email: '...' } }
    } catch (err) {
      console.error('[Factus] Error al consultar adquiriente DIAN:', err.response ? err.response.data : err.message);
      throw err;
    }
  }

  // ── Código de método de pago (DIAN) ───────────────────────────────────
  _metodoCodigo(metodo) {
    // Códigos oficiales del catálogo Factus v2
    const map = {
      'Efectivo':      '10',
      'Tarjeta':       '48',  // Tarjeta Crédito
      'Débito':        '49',  // Tarjeta Débito
      'Crédito':       '48',
      'Transferencia': '47',
      'Nequi':         '47',
      'Daviplata':     '47',
    };
    return map[metodo] || '10';
  }

  // ── HTTP helper autenticado ────────────────────────────────────────────
  _request(method, path, body = null, token = null) {
    const contentType = body && body.startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded';
    const headers = {
      'Accept':       'application/json',
      'Content-Type': contentType,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this._raw(method, path, body, contentType, token);
  }

  _raw(method, path, body = null, contentType = 'application/json', token = null) {
    return new Promise((resolve, reject) => {
      const url    = new URL(this.baseUrl + path);
      const isHttps = url.protocol === 'https:';
      const lib    = isHttps ? https : http;

      const headers = {
        'Accept':         'application/json',
        'Content-Type':   contentType,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (body)  headers['Content-Length'] = Buffer.byteLength(body);

      const options = {
        hostname: url.hostname,
        port:     url.port || (isHttps ? 443 : 80),
        path:     url.pathname + url.search,
        method,
        headers,
      };

      const req = lib.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            console.log(`[Factus] HTTP ${res.statusCode} ${path}:`, JSON.stringify(parsed).slice(0, 500));
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              // Factus v2 retorna errores en varios formatos
              let msg = parsed.message || parsed.error || parsed.error_description || `HTTP ${res.statusCode}`;
              // A veces los detalles están en parsed.errors (objeto o array)
              if (parsed.errors) {
                const errDetails = typeof parsed.errors === 'object'
                  ? Object.entries(parsed.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
                  : JSON.stringify(parsed.errors);
                msg = errDetails || msg;
              }
              reject(new Error(msg));
            }
          } catch (e) {
            reject(new Error('Respuesta inválida de Factus API: ' + raw.slice(0, 300)));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
  // ── Emitir Nota Crédito ─────────────────────────────────────────────────
  async emitirNotaCredito({ numeroFactura, rangoId, cliente, items, total, metodoPago, fecha, numeroFacturaRef, cufeRef, motivo }) {
    const token = await this._getToken();

    const invoiceItems = items.map((item, idx) => {
      const iva         = parseFloat(item.iva || 0);
      const impo        = parseFloat(item.impoconsumo || 0);
      const cantidad    = parseInt(item.cantidad || 1);
      const factorImp   = 1 + iva / 100 + impo / 100;
      const precioBase  = (item.precio || 0) / factorImp;
      const price       = parseFloat(precioBase.toFixed(2));
      const baseTotal   = price * cantidad;

      const taxes = [];
      if (iva > 0) taxes.push({ code: '01', rate: iva.toFixed(2), taxable_amount: baseTotal.toFixed(2), tax_amount: (baseTotal * iva / 100).toFixed(2) });
      if (impo > 0) taxes.push({ code: '04', rate: impo.toFixed(2), taxable_amount: baseTotal.toFixed(2), tax_amount: (baseTotal * impo / 100).toFixed(2) });
      if (taxes.length === 0) taxes.push({ code: '01', rate: '0.00', taxable_amount: baseTotal.toFixed(2), tax_amount: '0.00' });

      return {
        code_reference:     String(item.barcode || item.codigo || item.id || `P${idx + 1}`),
        name:               item.nombre || item.name || 'Producto',
        quantity:           cantidad,
        price:              price,
        discount_rate:      0,
        unit_measure_code:  '94',
        standard_code:      '1',
        is_excluded:        iva === 0 && impo === 0 ? 1 : 0,
        tribute_id:         iva > 0 ? '01' : (impo > 0 ? '04' : '03'),
        withholding_taxes:  [],
        taxes,
      };
    });

    let calculatedTotal = 0;
    invoiceItems.forEach(item => {
      let taxSum = 0;
      item.taxes.forEach(t => taxSum += parseFloat(t.tax_amount));
      calculatedTotal += (item.price * item.quantity) + taxSum;
    });

    const dueDate = fecha || new Date().toISOString().split('T')[0];

    const payload = {
      observation:             motivo || 'Nota crédito por devolución',
      payment_form:            1,
      payment_due_date:        dueDate,
      payment_method_id:       this._metodoCodigo(metodoPago || 'efectivo'),
      numbering_range_id:      parseInt(rangoId),
      reference_code:          numeroFactura,
      correction_concept_code: "2", // 2 = Devolución parcial o total
      bill_number:             numeroFacturaRef,
      payment_details: [
        {
          payment_form:        1,
          payment_method_code: String(this._metodoCodigo(metodoPago || 'efectivo')),
          amount:              parseFloat(calculatedTotal.toFixed(2)),
        },
      ],
      customer: this._buildCustomerPayload(cliente),
      items: invoiceItems,
    };

    console.log('[Factus] Emitiendo Nota Crédito:', JSON.stringify(payload, null, 2));
    const data = await this._raw('POST', '/v2/credit-notes/validate', JSON.stringify(payload), 'application/json', token);
    const nc = data.data || data;
    return { ok: true, cufe: nc.cufe || '', cude: nc.cude || '', numero: nc.number || '', pdf: (nc.links && nc.links.public_url) || '' };
  }

  // ── Emitir Nota Débito ──────────────────────────────────────────────────
  async emitirNotaDebito({ numeroFactura, rangoId, cliente, items, total, metodoPago, fecha, numeroFacturaRef, cufeRef, motivo }) {
    const token = await this._getToken();

    const invoiceItems = items.map((item, idx) => {
      const iva         = parseFloat(item.iva || 0);
      const impo        = parseFloat(item.impoconsumo || 0);
      const cantidad    = parseInt(item.cantidad || 1);
      const factorImp   = 1 + iva / 100 + impo / 100;
      const precioBase  = (item.precio || 0) / factorImp;
      const price       = parseFloat(precioBase.toFixed(2));
      const baseTotal   = price * cantidad;

      const taxes = [];
      if (iva > 0) taxes.push({ code: '01', rate: iva.toFixed(2), taxable_amount: baseTotal.toFixed(2), tax_amount: (baseTotal * iva / 100).toFixed(2) });
      if (impo > 0) taxes.push({ code: '04', rate: impo.toFixed(2), taxable_amount: baseTotal.toFixed(2), tax_amount: (baseTotal * impo / 100).toFixed(2) });
      if (taxes.length === 0) taxes.push({ code: '01', rate: '0.00', taxable_amount: baseTotal.toFixed(2), tax_amount: '0.00' });

      return {
        code_reference:     String(item.barcode || item.codigo || item.id || `P${idx + 1}`),
        name:               item.nombre || item.name || 'Producto',
        quantity:           cantidad,
        price:              price,
        discount_rate:      0,
        unit_measure_code:  '94',
        standard_code:      '1',
        is_excluded:        iva === 0 && impo === 0 ? 1 : 0,
        tribute_id:         iva > 0 ? '01' : (impo > 0 ? '04' : '03'),
        withholding_taxes:  [],
        taxes,
      };
    });

    let calculatedTotal = 0;
    invoiceItems.forEach(item => {
      let taxSum = 0;
      item.taxes.forEach(t => taxSum += parseFloat(t.tax_amount));
      calculatedTotal += (item.price * item.quantity) + taxSum;
    });

    const dueDate = fecha || new Date().toISOString().split('T')[0];

    const payload = {
      observation:             motivo || 'Nota débito por ajuste',
      payment_form:            1,
      payment_due_date:        dueDate,
      payment_method_id:       this._metodoCodigo(metodoPago || 'efectivo'),
      numbering_range_id:      parseInt(rangoId),
      reference_code:          numeroFactura,
      correction_concept_code: "1", // 1 = Intereses, 2 = Gastos por cobrar, etc.
      bill_number:             numeroFacturaRef,
      payment_details: [
        {
          payment_form:        1,
          payment_method_code: String(this._metodoCodigo(metodoPago || 'efectivo')),
          amount:              parseFloat(calculatedTotal.toFixed(2)),
        },
      ],
      customer: this._buildCustomerPayload(cliente),
      items: invoiceItems,
    };

    console.log('[Factus] Emitiendo Nota Débito:', JSON.stringify(payload, null, 2));
    const data = await this._raw('POST', '/v2/debit-notes', JSON.stringify(payload), 'application/json', token);
    const nd = data.data || data;
    return { ok: true, cufe: nd.cufe || '', cude: nd.cude || '', numero: nd.number || '', pdf: (nd.links && nd.links.public_url) || '' };
  }

  // ── Auxiliares para formatear el cliente con reglas DIAN ─────────────────
  _buildCustomerPayload(cliente) {
    const defaultCustomer = {
      identification:              '222222222222',
      dv:                          null,
      company:                     null,
      trade_name:                  null,
      names:                       'Consumidor Final',
      address:                     'Cra 1 1 1',
      email:                       'consumidor@final.com',
      phone:                       '3000000000',
      legal_organization_id:       2,
      tribute_id:                  21,
      identification_document_code: '13',
      municipality_id:             980,
    };

    if (!cliente) return defaultCustomer;

    const dianCodeMap = {
      NIT: '31',
      CC: '13',
      CE: '22',
      PP: '41',
      TE: '21',
      TI: '12',
    };
    const dianCode = dianCodeMap[cliente.tipo] || '13';

    let cleanId = String(cliente.identificacion || '').trim().replace(/[\.\s]/g, '');
    let dv = null;

    if (cliente.tipo === 'NIT' || dianCode === '31') { // NIT
      if (cleanId.includes('-')) {
        const parts = cleanId.split('-');
        cleanId = parts[0].replace(/\D/g, '');
        dv = parts[1] ? parts[1].trim() : null;
      }
      
      if (dv === null || dv === '' || isNaN(parseInt(dv, 10)) || parseInt(dv, 10) < 0 || parseInt(dv, 10) > 9) {
        dv = String(this._calcularDV(cleanId));
      } else {
        dv = String(parseInt(dv, 10));
      }
    } else {
      // CC, CE, PP, TE must be strictly numeric for DIAN
      cleanId = cleanId.replace(/\D/g, '');
    }

    if (!cleanId) return defaultCustomer;

    return {
      identification:              cleanId,
      dv:                          dv,
      company:                     cliente.tipo === 'NIT' ? (cliente.nombre || '').trim() : null,
      trade_name:                  null,
      names:                       cliente.tipo !== 'NIT' ? (cliente.nombre || 'Cliente General').trim() : null,
      address:                     (cliente.direccion || 'Cra 1 1 1').trim(),
      email:                       (cliente.email || 'consumidor@final.com').trim(),
      phone:                       String(cliente.telefono || cliente.phone || '3000000000').trim().replace(/\D/g, '').substring(0, 10),
      legal_organization_id:       cliente.tipo === 'NIT' ? 1 : 2,
      tribute_id:                  21,
      identification_document_code: dianCode,
      municipality_id:             980,
    };
  }

  _calcularDV(nit) {
    if (!nit) return 0;
    const tempNit = String(nit).replace(/\D/g, '');
    if (tempNit.length === 0) return 0;
    
    const vpri = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let x = 0;
    const z = tempNit.length;
    
    for (let i = 0; i < z; i++) {
      const temp = tempNit.charAt(z - 1 - i);
      x += parseInt(temp, 10) * vpri[i];
    }
    
    const y = x % 11;
    return (y > 1) ? 11 - y : y;
  }

}

module.exports = FactusClient;
