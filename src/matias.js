const https = require('https');
const http = require('http');

class MatiasClient {
  constructor(baseUrl, token, softwareId = '', softwarePin = '') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
    this.softwareId = softwareId;
    this.softwarePin = softwarePin;
  }

  // ── Emitir Factura Electrónica 
  async emitirFactura({ numeroFactura, cliente, items, total, metodoPago, fecha }) {
    // Construir líneas de detalle para Matias API
    const lineas = items.map((item, i) => {
      const iva = parseFloat(item.iva || 0);
      const impoconsumo = parseFloat(item.impoconsumo || 0);
      const factorImpuesto = 1 + (iva / 100) + (impoconsumo / 100);
      
      const precioUnitarioBase = item.precio / factorImpuesto;
      const cantidad = parseInt(item.cantidad);

      const taxes = [];
      let totalTaxAmount = 0;

      if (iva > 0) {
        const ivaItem = precioUnitarioBase * (iva / 100) * cantidad;
        totalTaxAmount += ivaItem;
        taxes.push({
          tax_id: 1, // 1 = IVA
          tax_amount: ivaItem.toFixed(2),
          taxable_amount: (precioUnitarioBase * cantidad).toFixed(2),
          percent: iva.toFixed(2)
        });
      }

      if (impoconsumo > 0) {
        const impoItem = precioUnitarioBase * (impoconsumo / 100) * cantidad;
        totalTaxAmount += impoItem;
        taxes.push({
          tax_id: 4, // 4 = INC (Impuesto Nacional al Consumo)
          tax_amount: impoItem.toFixed(2),
          taxable_amount: (precioUnitarioBase * cantidad).toFixed(2),
          percent: impoconsumo.toFixed(2)
        });
      }

      return {
        code_item: item.barcode || item.id || `P${i+1}`,
        standard_code_id: 3, // 3 = Sin código estándar
        description: item.nombre,
        price_amount: precioUnitarioBase.toFixed(2),
        discount_rate: 0,
        discount_amount: 0,
        invoiced_quantity: cantidad,
        unit_measure_id: 70, // 70 = Unidad
        tax_amount: totalTaxAmount.toFixed(2), 
        taxes: taxes,
        withholding_taxes: []
      };
    });

    const tipoDoc = cliente.tipo === 'NIT' ? 31 :
                    cliente.tipo === 'CE' ? 22 :
                    cliente.tipo === 'PP' ? 91 : 13; // 13 = CC

    const payload = {
      number: numeroFactura,
      type_document_id: 1, // 1 = Factura de venta
      resolution_number: "0", // 0 para usar la activa
      ...(this.softwareId ? { software_id: this.softwareId } : {}),
      ...(this.softwarePin ? { software_pin: this.softwarePin } : {}),
      customer: {
        identification_number: cliente.identificacion,
        name: cliente.nombre || 'Consumidor Final',
        phone: cliente.telefono || '0000000000',
        address: cliente.direccion || 'Colombia',
        email: cliente.email || 'consumidor@final.com',
        merchant_registration: "000000",
        type_document_identification_id: tipoDoc,
        type_organization_id: cliente.tipo === 'NIT' ? 1 : 2, // 1=Juridica, 2=Natural
        type_regime_id: 2, // No responsable de IVA
        municipality_id: 1000 // Placeholder
      },
      payment_form: {
        payment_form_id: 1, // Contado
        payment_method_id: this._metodoCodigo(metodoPago),
        payment_due_date: new Date().toISOString().split('T')[0]
      },
      items: lineas
    };

    const data = await this._request(
      'POST',
      '/invoice',
      JSON.stringify(payload)
    );

    return {
      ok: true,
      cufe: data.document_key || '',
      qr: data.qr_url || '',
      numero: numeroFactura,
      pdf: data.pdf_url || '',
    };
  }

  async getSiguienteNumero() {
    // Matias API manages consecutive automatically when sending an invoice, 
    // but if we need a preview, we can return a placeholder or query documents.
    // For now returning 1, or query last document.
    return 1; 
  }

  // ── Verificar credenciales ───────────────────────────
  async verificarCredenciales() {
    try {
      // Verificamos conexión consultando métodos de pago
      await this._request('GET', '/payment-methods');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Código de método de pago (DIAN) ──────────────────
  _metodoCodigo(metodo) {
    const map = {
      'Efectivo': 10,
      'Transferencia': 47,
      'Débito': 48,
      'Crédito': 48,
    };
    return map[metodo] || 10;
  }

  // ── HTTP helper ───────────────────────────────────────
  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
      if (body) headers['Content-Length'] = Buffer.byteLength(body);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      };

      const req = lib.request(options, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error('Respuesta inválida de Matias API: ' + raw.slice(0, 200)));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = MatiasClient;
