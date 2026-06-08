# ☕ MiCafe POS — Planificación General Completa Definitiva (Firebase + Touch)

> **Base:** Proyecto "MiCafe POS" (Electron + Next.js + Diseño v0 + Firebase Offline)
> **Cliente:** Cafetería con múltiples líneas de negocio
> **Última actualización:** 1 de junio de 2026 (después de reunión presencial)
> **Nota:** Este documento es solo planificación. No se modifica el proyecto actual de tienda de barrio.

---

## 🖥️ Interfaz Híbrida (Táctil + Teclado/Mouse)
El diseño del POS está adaptado para pantallas pequeñas tradicionales (ej. 15 pulgadas, 1024x768) con operación táctil (botones grandes) pero que corre sobre Windows normal, permitiendo usar teclado y mouse para tareas como facturación DIAN.

---

## Perfil del Negocio

Este **no es solo una cafetería**. Es un negocio multifuncional que opera varias líneas bajo el mismo techo:

| Línea de negocio | Descripción |
|---|---|
| ☕ **Cafetería** | Comida y bebidas preparadas (sándwiches, café, jugos) con recetas e ingredientes |
| 🎨 **Artesanías** | Turbantes, gorros, artículos hechos a mano — categorías propias |
| 📚 **Librería** | Venta de libros |
| 📄 **Fotocopias / Impresiones** | Servicio de impresión y fotocopiado con control de tinta |
| 🏢 **Alquiler** | Renta del espacio físico y de equipos de cómputo por hora/día |
| 🤝 **Consignación (Comisiones)** | Venden productos de **otras empresas** y ganan una comisión por cada venta |

> [!IMPORTANT]
> El inventario de cada línea de negocio debe vivir en **espacios separados**. El dueño no quiere ver los turbantes mezclados con el queso, ni los libros con las fotocopias. Cada espacio tiene sus propias categorías.

---

## Requerimientos Confirmados

### Del documento anterior (ya validados)

1. ✅ **3 vendedores en caja** con usuario individual
2. ✅ **Reportes por vendedor** (día, semana, mes)
3. ✅ **Reportes globales** del negocio
4. ✅ **Recetas e ingredientes** con descuento automático del inventario al vender
5. ✅ **Inventario de insumos** (materia prima de cafetería)
6. ✅ **Cálculo de producción** ("¿Cuántos sándwiches puedo preparar?")
7. ✅ **Registro de costo de insumos** (cuánto costó el queso)
8. ✅ **Permisos granulares** por cajero
9. ✅ **Cuadre de caja** (apertura/cierre de turno)
10. ✅ **App web/móvil** para que el dueño monitoree desde el celular

### Nuevos (reunión del 1 de junio)

11. ✅ **3 métodos de pago:** Efectivo, Transferencia, Cuenta de cobro
12. ✅ **Ventas en consignación:** Productos de terceros con comisión
13. ✅ **Inventario separado** para consignación (no se mezcla con lo propio)
14. ✅ **Alertas de inventario bajo** cuando un producto esté por acabarse
15. ✅ **Alquiler de espacio** (salas, mesas de trabajo)
16. ✅ **Alquiler de equipos de cómputo** (por hora)
17. ✅ **Conteo de fotocopias e impresiones** con estimación de tinta restante
18. ✅ **Comandas multi-mesa** (cada mesa es independiente, no se mezclan)
19. ✅ **Venta de libros** como categoría propia
20. ✅ **Artesanías** (turbantes, gorros, etc.) con categorías separadas
21. ✅ **Pago diferido / Fiados** — el cliente paga después, con emisión posterior a DIAN
22. ✅ **Facturación DIAN** compatible con ventas diferidas

---

## Módulos del Sistema

---

### Módulo 1: Métodos de Pago ⭐

El negocio maneja **3 formas de pago**, y el cajero debe seleccionar una (o combinar) al momento de cobrar:

| Método | Icono | Descripción |
|---|---|---|
| **Efectivo** | 💵 | Billetes y monedas. Se cuadra en cierre de caja |
| **Transferencia** | 📱 | Nequi, Daviplata, transferencia bancaria |
| **Cuenta de cobro** | 📋 | El cliente se lleva el producto y **paga después**. Se genera una cuenta pendiente |

#### Pantalla: Cobrar venta

```
┌──────────────────────────────────────────────────────────────┐
│  💰 Cobrar Venta #0234                                       │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Total a pagar: $28,500                                      │
│                                                              │
│  Método de pago:                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ 💵           │ │ 📱           │ │ 📋                   │  │
│  │ Efectivo     │ │ Transferencia│ │ Cuenta de cobro      │  │
│  │              │ │              │ │                      │  │
│  └──────────────┘ └──────────────┘ └──────────────────────┘  │
│                                                              │
│  ── Pago mixto (opcional) ──                                 │
│  ☐ Dividir en 2 métodos                                     │
│     Efectivo:      [$15,000___]                              │
│     Transferencia: [$13,500___]                              │
│                                                              │
│  ── Si es Cuenta de cobro ──                                 │
│  Cliente: [Buscar o crear cliente...] 🔍                     │
│  Fecha límite de pago: [08/06/2026]                          │
│  Notas: [Paga el lunes en la mañana_______]                 │
│                                                              │
│          [❌ Cancelar]  [✅ Confirmar Pago]                  │
└──────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> Cuando se selecciona **"Cuenta de cobro"**, la venta queda registrada como **pendiente de pago**. El producto se entrega, pero el ingreso queda en estado "por cobrar". La factura electrónica a la DIAN se puede emitir en el momento de la venta O cuando el cliente pague (ver Módulo de Fiados/Pago Diferido).

---

### Módulo 2: Pago Diferido / Fiados y Facturación DIAN ⭐

Este módulo es **crítico** porque el negocio permite que los clientes paguen después. Hay dos escenarios:

#### Escenario A: Factura inmediata, pago después

```
Cliente pide un sándwich → Cajero cobra → Selecciona "Cuenta de cobro"
   → Se genera la factura electrónica DIAN inmediatamente
   → El cliente paga al día siguiente
   → El cajero marca la cuenta como "Pagada"
```

#### Escenario B: Factura al momento del pago

```
Cliente pide un sándwich → Cajero cobra → Selecciona "Cuenta de cobro"
   → Se registra como venta interna (sin factura DIAN aún)
   → El cliente paga al día siguiente
   → En ese momento se emite la factura electrónica DIAN
```

> [!WARNING]
> La DIAN en Colombia exige que la factura se emita dentro de las **24 horas** posteriores a la venta para facturadores electrónicos. El sistema debe alertar si una cuenta de cobro tiene más de 20 horas sin facturar.

#### Pantalla: Cuentas por Cobrar

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Cuentas por Cobrar                                           │
│──────────────────────────────────────────────────────────────────│
│  Filtrar: [Pendientes ▼]  Buscar: [________________] 🔍        │
│                                                                  │
│  ┌────────┬─────────────┬───────────┬──────────┬────────┬──────┐ │
│  │ # Venta│ Cliente     │ Monto     │ Fecha    │ Límite │ DIAN │ │
│  ├────────┼─────────────┼───────────┼──────────┼────────┼──────┤ │
│  │ V-0231 │ Juan Pérez  │ $18,500   │ 01/06   │ 02/06  │ ⚠️   │ │
│  │ V-0228 │ Ana Torres  │ $45,000   │ 31/05   │ 05/06  │ ✅   │ │
│  │ V-0225 │ Carlos M.   │ $12,000   │ 30/05   │ 01/06  │ 🔴   │ │
│  └────────┴─────────────┴───────────┴──────────┴────────┴──────┘ │
│                                                                  │
│  ⚠️ = Factura DIAN pendiente (menos de 24h)                     │
│  ✅ = Factura DIAN ya emitida                                    │
│  🔴 = URGENTE — Pasó el plazo de facturación                    │
│                                                                  │
│  Total pendiente: $75,500                                        │
│                                                                  │
│  Al seleccionar una cuenta:                                      │
│  [💵 Registrar Pago]  [🧾 Emitir Factura DIAN]  [📋 Detalle]  │
└──────────────────────────────────────────────────────────────────┘
```

#### Flujo de pago diferido completo

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Cajero vende │────▶│ Cuenta de cobro  │────▶│ Producto entregado │
│ el producto  │     │ (pago pendiente) │     │ Inventario baja    │
└─────────────┘     └──────────────────┘     └────────────────────┘
                           │                          │
                    ┌──────┴──────┐                   │
                    ▼             ▼                   │
            ┌─────────────┐ ┌─────────────┐          │
            │ Factura DIAN│ │ Sin factura │          │
            │ inmediata   │ │ (máx 24h)   │          │
            └─────────────┘ └──────┬──────┘          │
                                   │                  │
                            ... cliente paga ...      │
                                   │                  │
                                   ▼                  │
                          ┌──────────────────┐        │
                          │ Registrar pago   │        │
                          │ + Emitir factura │        │
                          │ DIAN si faltaba  │        │
                          └──────────────────┘        │
```

---

### Módulo 3: Ventas por Consignación (Comisiones) ⭐ NUEVO

El negocio vende productos **de otras empresas** y se queda con una **comisión** por cada venta. Esto requiere un inventario completamente separado.

#### Concepto

```
┌───────────────────────────────────────────────────────────┐
│                  PRODUCTOS PROPIOS                         │
│  (Los compra el negocio, los vende, se queda el 100%)     │
│                                                            │
│  ☕ Café con leche     → Precio: $4,500  │ Ganancia: 100% │
│  🥪 Sándwich          → Precio: $8,000  │ Ganancia: 100% │
│  📚 Libro X           → Precio: $35,000 │ Ganancia: 100% │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│              PRODUCTOS EN CONSIGNACIÓN                     │
│  (Son de otra empresa; el negocio gana solo la comisión)  │
│                                                            │
│  🧴 Crema artesanal   → PVP: $25,000                     │
│     Empresa: "Natuleza"                                    │
│     Comisión: 20% → Ganancia: $5,000                      │
│     Debe pagar a Natuleza: $20,000                        │
│                                                            │
│  🕯️ Velas aromáticas → PVP: $18,000                     │
│     Empresa: "AromaCol"                                    │
│     Comisión: 25% → Ganancia: $4,500                      │
│     Debe pagar a AromaCol: $13,500                        │
└───────────────────────────────────────────────────────────┘
```

#### Pantalla: Inventario de Consignación

```
┌──────────────────────────────────────────────────────────────┐
│  🤝 Productos en Consignación                                │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Empresa: [Todas ▼]   Buscar: [______________] 🔍          │
│                                                              │
│  ┌──────────────────┬──────────┬─────────┬────────┬───────┐  │
│  │ Producto         │ Empresa  │ PVP     │ Comis. │ Stock │  │
│  ├──────────────────┼──────────┼─────────┼────────┼───────┤  │
│  │ Crema artesanal  │ Natuleza │ $25,000 │  20%   │  12   │  │
│  │ Velas aromáticas │ AromaCol │ $18,000 │  25%   │   8   │  │
│  │ Jabón natural    │ Natuleza │ $12,000 │  20%   │   5 ⚠️│  │
│  │ Aceite esencial  │ BioPuro  │ $32,000 │  15%   │   3 ⚠️│  │
│  └──────────────────┴──────────┴─────────┴────────┴───────┘  │
│                                                              │
│  ─── Liquidación pendiente ───                               │
│                                                              │
│  📋 Natuleza:  Vendidos 8 productos → Debe pagar: $160,000  │
│  📋 AromaCol:  Vendidos 3 productos → Debe pagar: $40,500   │
│  📋 BioPuro:   Vendidos 1 producto  → Debe pagar: $27,200   │
│                                                              │
│  💰 Tu comisión acumulada: $56,800                           │
│                                                              │
│  [➕ Agregar producto] [📊 Reporte] [💵 Liquidar empresa]   │
└──────────────────────────────────────────────────────────────┘
```

#### Pantalla: Liquidar a Empresa

```
┌──────────────────────────────────────────────────────────────┐
│  💵 Liquidación — Natuleza                                   │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Periodo: 01/05/2026 — 31/05/2026                           │
│                                                              │
│  ┌──────────────────┬──────┬─────────┬─────────┬──────────┐  │
│  │ Producto         │ Cant │ PVP     │ Comis.  │ A pagar  │  │
│  ├──────────────────┼──────┼─────────┼─────────┼──────────┤  │
│  │ Crema artesanal  │  5   │$125,000 │ $25,000 │ $100,000 │  │
│  │ Jabón natural    │  3   │ $36,000 │  $7,200 │  $28,800 │  │
│  └──────────────────┴──────┴─────────┴─────────┴──────────┘  │
│                                                              │
│  Total vendido:           $161,000                           │
│  Tu comisión (20%):       - $32,200                          │
│  A pagar a Natuleza:      $128,800                           │
│                                                              │
│  Método de pago: [Transferencia ▼]                          │
│  Referencia:     [Transf. Bancolombia #4521___]             │
│                                                              │
│          [❌ Cancelar]  [✅ Registrar Liquidación]           │
└──────────────────────────────────────────────────────────────┘
```

---

### Módulo 4: Inventario Multi-Espacio con Categorías ⭐ NUEVO

El inventario se organiza en **espacios independientes**, cada uno con sus propias categorías. El dueño puede ver cada espacio por separado o un consolidado general.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESPACIOS DE INVENTARIO                         │
│─────────────────────────────────────────────────────────────────│
│                                                                  │
│  ☕ CAFETERÍA                  🎨 ARTESANÍAS                    │
│  ├── Bebidas calientes        ├── Turbantes                     │
│  ├── Bebidas frías            ├── Gorros                        │
│  ├── Sándwiches               ├── Manillas                      │
│  ├── Repostería               ├── Aretes                        │
│  └── Combos                   └── Decoración                    │
│                                                                  │
│  📚 LIBRERÍA                  🤝 CONSIGNACIÓN                  │
│  ├── Novelas                  ├── Natuleza (Cremas, jabones)    │
│  ├── Académicos               ├── AromaCol (Velas, aceites)    │
│  ├── Infantiles               └── BioPuro (Aceites esenciales)  │
│  └── Revistas                                                   │
│                                                                  │
│  📄 SERVICIOS                 🏢 ALQUILER                      │
│  ├── Fotocopias B/N           ├── Sala de reuniones             │
│  ├── Impresiones color        ├── Escritorios                   │
│  └── Tóner/Tinta (insumo)    └── Equipos de cómputo            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Selector de espacio en la barra lateral

```
┌────────────────────────┐
│ 📦 Inventario          │
│────────────────────────│
│                        │
│  [☕ Cafetería     ▼]  │
│                        │
│  ☕ Cafetería           │
│  🎨 Artesanías         │
│  📚 Librería           │
│  🤝 Consignación       │
│  📄 Servicios          │
│  🏢 Alquiler           │
│  ── Todos (general) ── │
│                        │
└────────────────────────┘
```

> [!IMPORTANT]
> Los productos de **consignación** NUNCA se mezclan visualmente con los propios. Tienen un badge especial "🤝 Consignación" y su columna de "Comisión" es visible solo en ese espacio.

---

### Módulo 5: Alertas de Inventario Bajo ⭐ NUEVO

Alertas automáticas cuando un producto o insumo está por acabarse.

#### Configuración por producto

Cada producto/insumo tiene un **umbral mínimo** configurable:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️ Configurar Alertas de Stock                             │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  ┌──────────────────┬──────────┬───────────┬──────────────┐  │
│  │ Producto/Insumo  │ Stock    │ Mínimo    │ Estado       │  │
│  ├──────────────────┼──────────┼───────────┼──────────────┤  │
│  │ 🧀 Queso        │ 4,200g   │ 1,000g    │ ✅ OK        │  │
│  │ 🍖 Jamón        │   480g   │   500g    │ ⚠️ ¡Bajo!    │  │
│  │ 🧶 Turbante rojo│     2    │     3     │ ⚠️ ¡Bajo!    │  │
│  │ 📚 Libro "XYZ"  │     1    │     2     │ ⚠️ ¡Bajo!    │  │
│  │ 🖨️ Tóner negro │   18%    │    20%    │ 🔴 Crítico   │  │
│  └──────────────────┴──────────┴───────────┴──────────────┘  │
│                                                              │
│  🔔 Notificaciones: ☑ Mostrar al iniciar sesión             │
│                     ☑ Enviar al dueño (app móvil)           │
│                     ☑ Mostrar badge en menú lateral          │
└──────────────────────────────────────────────────────────────┘
```

#### Cómo se muestran las alertas

```
Al abrir el POS o al iniciar turno:

┌──────────────────────────────────────────────────┐
│  ⚠️ Alertas de Inventario                        │
│──────────────────────────────────────────────────│
│                                                  │
│  🔴 Tóner negro al 18% — ¡Queda para ~90 copias!│
│  ⚠️ Jamón: 480g — Alcanza para ~12 sándwiches   │
│  ⚠️ Turbante rojo: 2 unidades                   │
│  ⚠️ Libro "XYZ": 1 unidad                       │
│                                                  │
│            [Entendido]  [Ver inventario]          │
└──────────────────────────────────────────────────┘

Y en el menú lateral, el ícono de inventario muestra:

  📦 Inventario  ⚠️ 4
```

---

### Módulo 6: Fotocopias, Impresiones y Control de Tinta ⭐ NUEVO

Módulo dedicado para el servicio de fotocopiado e impresión.

#### Registro de cada servicio

```
┌──────────────────────────────────────────────────────────────┐
│  📄 Registrar Fotocopias / Impresiones                       │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Tipo:                                                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────────┐  │
│  │ 📄              │ │ 🖨️              │ │ 🎨             │  │
│  │ Fotocopia B/N   │ │ Impresión B/N   │ │ Impresión      │  │
│  │ $100 c/u        │ │ $200 c/u        │ │ Color $500 c/u │  │
│  └─────────────────┘ └─────────────────┘ └────────────────┘  │
│                                                              │
│  Cantidad:  [___15___] páginas                               │
│  Tamaño:    [Carta ▼]  (Carta / Oficio / A4)               │
│  Caras:     [Una cara ▼] (Una cara / Doble cara)            │
│                                                              │
│  ─── Cálculo ───                                             │
│  15 fotocopias B/N × $100 = $1,500                          │
│                                                              │
│          [❌ Cancelar]  [✅ Agregar a venta]                 │
└──────────────────────────────────────────────────────────────┘
```

#### Control de tinta / tóner

```
┌──────────────────────────────────────────────────────────────┐
│  🖨️ Estado de Impresoras y Tóner                            │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Impresora: HP LaserJet Pro                                  │
│                                                              │
│  ┌─────────────────────┬────────┬────────────┬────────────┐  │
│  │ Tóner/Cartucho      │ Nivel  │ Copias est.│ Último     │  │
│  ├─────────────────────┼────────┼────────────┼────────────┤  │
│  │ ⬛ Negro            │  42%   │ ~420 pág.  │ Camb 15/05 │  │
│  │ 🟦 Cian             │  68%   │ ~340 pág.  │ Camb 01/05 │  │
│  │ 🟥 Magenta          │  55%   │ ~275 pág.  │ Camb 01/05 │  │
│  │ 🟨 Amarillo         │  71%   │ ~355 pág.  │ Camb 01/05 │  │
│  └─────────────────────┴────────┴────────────┴────────────┘  │
│                                                              │
│  📊 Historial de uso:                                        │
│  ── Hoy:      45 copias B/N, 12 color                       │
│  ── Semana:   280 copias B/N, 65 color                      │
│  ── Mes:      1,240 copias B/N, 310 color                   │
│                                                              │
│  💰 Ingresos del mes por fotocopias: $186,000               │
│                                                              │
│  [🔄 Registrar cambio de tóner]  [📊 Reporte completo]     │
└──────────────────────────────────────────────────────────────┘
```

#### Estimación de copias restantes

El sistema calcula un **aproximado** de cuántas copias más se pueden sacar:

```
Fórmula:

  Rendimiento del tóner (según fabricante): 1,000 páginas
  Nivel actual: 42%
  Copias estimadas restantes: 1,000 × 0.42 = ~420 páginas

  A ritmo actual (45/día): Alcanza para ~9 días más
```

> [!NOTE]
> El nivel de tinta se ingresa **manualmente** (el cajero o admin lo actualiza periódicamente). No se conecta a la impresora. El sistema descuenta automáticamente 1 unidad por cada fotocopia/impresión B/N y ~3 unidades de color por cada impresión a color (configurable). Cuando el tóner llega a 0%, se registra un "cambio de tóner" y el contador se reinicia al 100%.

---

### Módulo 7: Alquiler de Espacio y Equipos ⭐ NUEVO

Controla la renta del espacio físico (salas, mesas) y de equipos de cómputo.

#### Pantalla: Gestión de Alquiler

```
┌──────────────────────────────────────────────────────────────┐
│  🏢 Alquiler de Espacio y Equipos                            │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  ── Recursos disponibles ──                                  │
│                                                              │
│  ┌────────────────────┬─────────┬──────────┬──────────────┐  │
│  │ Recurso            │ Tarifa  │ Estado   │ Acción       │  │
│  ├────────────────────┼─────────┼──────────┼──────────────┤  │
│  │ 🖥️ PC #1          │ $3,000/h│ 🟢 Libre │ [▶ Iniciar]  │  │
│  │ 🖥️ PC #2          │ $3,000/h│ 🔴 En uso│ [⏹ Finalizar]│  │
│  │ 🖥️ PC #3          │ $3,000/h│ 🟢 Libre │ [▶ Iniciar]  │  │
│  │ 🏢 Sala reuniones  │$15,000/h│ 🟢 Libre │ [▶ Iniciar]  │  │
│  │ 🪑 Escritorio #1  │ $5,000/h│ 🔴 En uso│ [⏹ Finalizar]│  │
│  └────────────────────┴─────────┴──────────┴──────────────┘  │
│                                                              │
│  ── En uso actualmente ──                                    │
│                                                              │
│  🖥️ PC #2 — Cliente: "Estudiante Juan"                     │
│     Inicio: 2:30 PM  │  Tiempo: 1h 45m  │  Acumulado: $5,250│
│                                                              │
│  🪑 Escritorio #1 — Cliente: "María G."                     │
│     Inicio: 10:00 AM │  Tiempo: 4h 15m  │  Acumulado: $21,250│
│                                                              │
│  💰 Ingresos hoy por alquiler: $48,500                      │
│                                                              │
│  [➕ Agregar recurso]  [📊 Reporte mensual]                 │
└──────────────────────────────────────────────────────────────┘
```

#### Flujo: Alquilar un equipo

```
Cajero presiona [▶ Iniciar] en PC #1
         │
         ▼
┌─────────────────────────────────┐
│  ▶ Iniciar Alquiler             │
│─────────────────────────────────│
│                                 │
│  Recurso: 🖥️ PC #1            │
│  Tarifa:  $3,000 / hora        │
│  Cliente: [Juan_________] 🔍   │
│  Hora inicio: 3:15 PM (auto)   │
│                                 │
│  ☐ Tiempo fijo: [__2__] horas  │
│  ☑ Tiempo abierto (se cobra    │
│    al finalizar)                │
│                                 │
│    [Cancelar]  [▶ Iniciar]     │
└─────────────────────────────────┘

         ... 2 horas después ...

Cajero presiona [⏹ Finalizar] en PC #1
         │
         ▼
┌─────────────────────────────────┐
│  ⏹ Finalizar Alquiler          │
│─────────────────────────────────│
│                                 │
│  Recurso: 🖥️ PC #1            │
│  Inicio:  3:15 PM              │
│  Fin:     5:20 PM              │
│  Tiempo:  2h 05m               │
│  Cobro:   $6,250               │
│  (se redondea a la media hora  │
│   más cercana si se desea)     │
│                                 │
│  ☐ Agregar al carrito actual   │
│  ☑ Cobrar independientemente   │
│                                 │
│   [Cancelar] [💵 Cobrar]       │
└─────────────────────────────────┘
```

---

### Módulo 8: Comandas Multi-Mesa ⭐ NUEVO

El problema con Siigo es que **mezcla todas las mesas en una sola orden**. Aquí cada mesa es completamente independiente.

#### Pantalla: Vista de Mesas

```
┌──────────────────────────────────────────────────────────────┐
│  🍽️ Mesas Activas                                           │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Mesa 1  │  │ Mesa 2  │  │ Mesa 3  │  │ Mesa 4  │       │
│  │ 🟢 Libre│  │ 🔴 $28K │  │ 🔴 $15K │  │ 🟢 Libre│       │
│  │         │  │ 3 items │  │ 1 item  │  │         │       │
│  │         │  │ 45 min  │  │ 12 min  │  │         │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Mesa 5  │  │ Mesa 6  │  │ Barra 1 │  │ Barra 2 │       │
│  │ 🟡 $52K │  │ 🟢 Libre│  │ 🔴 $8K  │  │ 🟢 Libre│       │
│  │ 5 items │  │         │  │ 1 item  │  │         │       │
│  │ 1h 20m  │  │         │  │ 5 min   │  │         │       │
│  │ ⚠️ Fiad │  │         │  │         │  │         │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│  🟢 Libre   🔴 Ocupada   🟡 Cuenta de cobro pendiente      │
│                                                              │
│  [➕ Agregar mesa]  [📊 Resumen]  [🖨️ Comanda cocina]     │
└──────────────────────────────────────────────────────────────┘
```

#### Al tocar una mesa ocupada

```
┌──────────────────────────────────────────────────────────────┐
│  🍽️ Mesa 2                                    [X Cerrar]    │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Cajero: María  │  Hora apertura: 3:15 PM  │  45 min        │
│  Cliente: --                                                 │
│                                                              │
│  ┌──────────────────────────────────┬──────┬─────────┐       │
│  │ Producto                        │ Cant │ Subtotal │       │
│  ├──────────────────────────────────┼──────┼─────────┤       │
│  │ ☕ Café con leche               │  2   │ $9,000   │       │
│  │ 🥪 Sándwich Especial           │  1   │ $8,000   │       │
│  │    ➡️ Extra queso (+$1,500)    │      │          │       │
│  │ 🍊 Jugo natural                │  1   │ $5,500   │       │
│  └──────────────────────────────────┴──────┴─────────┘       │
│                                                              │
│  Subtotal: $24,000                                           │
│  IVA (si aplica): $4,560                                     │
│  Total: $28,560                                              │
│                                                              │
│  [➕ Agregar producto]  [🖨️ Comanda cocina]                │
│  [📋 Mover a otra mesa]                                     │
│  [💰 Cobrar mesa]   [📋 Cuenta de cobro]                   │
└──────────────────────────────────────────────────────────────┘
```

#### Comanda impresa en cocina

```
╔═══════════════════════════════════╗
║  COMANDA #0067  │  3:48 PM        ║
║  Mesa: 2        │  Cajero: María  ║
╠═══════════════════════════════════╣
║                                   ║
║  1x Sándwich Especial             ║
║     ➡️ EXTRA QUESO                ║
║                                   ║
║  1x Jugo natural naranja          ║
║                                   ║
║  ── NOTA: Sin cebolla ──          ║
║                                   ║
╚═══════════════════════════════════╝
```

> [!IMPORTANT]
> Cada mesa tiene su propia comanda. Si Mesa 2 pide un sándwich y Mesa 3 pide un café, van como dos comandas separadas a cocina. **Nunca se mezclan.** El cajero puede agregar productos a una mesa en cualquier momento y la cocina recibe solo lo nuevo.

---

### Módulo 9: Recetas, Insumos y Descuento Automático (del doc anterior)

_(Este módulo se mantiene exactamente igual al documento anterior)_

| Concepto | Descripción |
|---|---|
| **Ingredientes/Insumos** | Lo que se COMPRA (queso, jamón, café, leche) |
| **Recetas** | Fórmula que dice cuánto de cada insumo lleva un producto |
| **Productos** | Lo que se VENDE (Sándwich, Café con leche) |
| **Descuento automático** | Al vender 1 sándwich → baja 30g queso, 40g jamón, 2 panes, etc. |
| **Cálculo de producción** | "Con el inventario actual puedo hacer ~75 sándwiches más" |
| **Modificadores** | "Extra queso" → descuenta 60g en vez de 30g |
| **Costo real** | El sistema calcula cuánto cuesta preparar cada producto |
| **Margen** | Precio de venta - costo de insumos = ganancia |

---

### Módulo 10: Reportes por Vendedor y Globales (del doc anterior)

_(Se mantiene igual, con la adición de filtrar por espacio/línea de negocio)_

#### Reportes nuevos para este negocio

| Reporte | Descripción |
|---|---|
| **Ventas por cajero** | Cuánto vendió María, Carlos o Ana en un periodo |
| **Ventas globales** | Total del negocio por día, semana, mes |
| **Ventas por espacio** | Cuánto generó Cafetería vs Artesanías vs Fotocopias |
| **Comisiones ganadas** | Cuánto ganaron por productos en consignación |
| **Cuentas por cobrar** | Total de dinero pendiente de clientes que deben |
| **Gasto en insumos** | Cuánto se gastó comprando materia prima al mes |
| **Uso de impresora** | Cuántas copias, consumo de tinta, ingresos |
| **Alquiler** | Horas rentadas, equipos más usados, ingresos |
| **Rentabilidad** | Margen de ganancia por producto (costo vs precio) |
| **Inventario crítico** | Lista de productos bajo el umbral mínimo |

---

### Módulo 11: Usuarios, Permisos y Turnos (del doc anterior)

_(Se mantiene igual. Resumo los puntos clave)_

- 3 cajeros con sesión individual
- Permisos granulares: el cajero solo ve los módulos que el admin le permite
- Apertura/cierre de turno con cuadre de caja
- Conteo de billetes al cerrar turno
- Reporte de faltantes/sobrantes
- Historial de turnos del admin

---

### Módulo 12: App Móvil del Dueño (del doc anterior)

_(Se mantiene igual. Resumo los puntos clave)_

- Sincronización del POS local → nube (Firebase o servidor)
- Dashboard responsive en el celular
- Ver ventas en tiempo real, cajeros activos, inventario
- Alertas push: stock bajo, cierre de turno, faltantes
- Reportes desde el celular

---

## 🗄️ Estructura de Base de Datos (Colecciones Firestore)

En vez de tablas locales SQL, la estructura NoSQL en Firebase será (aprovechando Offline Persistence):

COLECCIONES CORE:
  ✅ productos
  ✅ ventas
  ✅ detalle_venta
  ✅ configuracion
  ✅ usuarios
  ✅ auditoria
  ✅ clientes
  ✅ proveedores
  ✅ facturas_electronicas

COLECCIONES NUEVAS:

  ── Recetas e insumos ──
  🆕 insumos                → Materias primas (queso, jamón, café, tóner...)
  🆕 compras_insumos        → Registro de compras a proveedores
  🆕 detalle_compra         → Detalle de cada compra
  🆕 recetas                → Nombre de la receta
  🆕 receta_ingredientes    → Qué insumos y cuánto lleva cada receta
  🆕 producto_receta        → Vincula un producto con su receta
  🆕 modificadores          → Extra queso, sin cebolla, etc.

  ── Organización Multi-Espacio ──
  🆕 espacios               → Cafetería, Artesanías, Librería, etc.
  🆕 categorias_espacios    → Categorías atadas a un espacio

  ── Consignación ──
  🆕 empresas_consignacion  → Datos de las marcas aliadas
  🆕 productos_consignacion → Inventario separado de consignación
  🆕 liquidaciones          → Pagos realizados a las empresas aliadas

  ── Cuentas y Mesas ──
  🆕 cuentas_cobro          → Deudas de clientes (fiados)
  🆕 mesas                  → Mesas activas
  🆕 comandas               → Pedidos enviados a cocina

  ── Alquiler e Impresión ──
  🆕 recursos_alquiler      → PCs, Salas, Escritorios
  🆕 sesiones_alquiler      → Historial de rentas
  🆕 impresoras             → Registro de máquinas y % tóner
  🆕 registro_impresiones   → Contador de copias sacadas


---

## Prioridades de Desarrollo

### Fase 1 — MVP (3-4 semanas) 🔴 Crítico

Lo mínimo para que el negocio pueda operar y reemplazar a Siigo:

- [ ] Espacios e inventario multi-categoría (separar cafetería, artesanías, librería)
- [ ] 3 métodos de pago (Efectivo, Transferencia, Cuenta de cobro)
- [ ] Cuentas por cobrar / Fiados con alerta de 24h para DIAN
- [ ] Mesas y comandas independientes (el dolor #1 con Siigo)
- [ ] Recetas e insumos con descuento automático
- [ ] Registro de compra de insumos
- [ ] Reportes por cajero (día, semana, mes)
- [ ] Permisos granulares por rol
- [ ] Turnos con cuadre de caja

### Fase 2 — Diferenciadores (2-3 semanas) 🟡 Importante

- [ ] Módulo de consignación (comisiones de terceros + liquidaciones)
- [ ] Alertas de inventario bajo
- [ ] Módulo de fotocopias/impresiones con control de tinta
- [ ] Módulo de alquiler de espacio y equipos de cómputo
- [ ] Cálculo de producción ("¿cuántos sándwiches puedo hacer?")
- [ ] Costo real por producto y análisis de margen
- [ ] Combos / menús del día
- [ ] Modificadores de productos (extra queso, sin cebolla)

### Fase 3 — Premium (2-3 semanas) 🟢 Avanzado

- [ ] Comandas impresas en cocina
- [ ] Control de desperdicios (merma)
- [ ] Reportes avanzados (hora pico, tendencias, comparativos)
- [ ] Sugerencia automática de compra de insumos
- [ ] Fechas de vencimiento de insumos
- [ ] Reporte de liquidación de consignación (PDF para la empresa)

### Fase 4 — App Móvil del Dueño (3-4 semanas) 🔵 Diferenciador

- [ ] Sincronización POS → Firebase/servidor
- [ ] Dashboard web responsive para celular
- [ ] Ventas en tiempo real, cajeros activos, inventario
- [ ] Alertas push (stock bajo, cierre turno, faltantes, cuentas vencidas)
- [ ] Resumen diario automático

---

## Resumen Visual del Sistema Completo

```
┌──────────────────────────────────────────────────────────────────────┐
│                 POS CAFETERÍA MULTIFUNCIONAL (PC)                      │
│──────────────────────────────────────────────────────────────────────│
│                                                                       │
│  🛒 VENDER          🍽️ MESAS/COMANDAS    📋 CUENTAS POR COBRAR     │
│  (caja rápida)      (cada mesa separada)  (fiados + factura DIAN)    │
│                                                                       │
│  📦 INVENTARIO      📋 RECETAS           🤝 CONSIGNACIÓN            │
│  (multi-espacio     (insumos por          (productos de terceros     │
│   con categorías)    producto)             con comisiones)            │
│                                                                       │
│  📄 FOTOCOPIAS      🏢 ALQUILER          💰 CUADRE DE CAJA         │
│  (conteo + tinta    (PCs, salas,          (apertura/cierre turno     │
│   + estimación)      escritorios)          con conteo de billetes)   │
│                                                                       │
│  👥 VENDEDORES      📊 REPORTES          📈 RENTABILIDAD            │
│  (ventas por        (globales, por        (margen por producto,      │
│   cajero)            espacio, por cajero)  costo vs precio)          │
│                                                                       │
│  ⚠️ ALERTAS         🕐 TURNOS            🔐 PERMISOS               │
│  (stock bajo,       (entrada/salida       (qué ve cada              │
│   tinta, vencim.)    de cajeros)           cajero)                   │
│                                                                       │
│  🗑️ MERMAS          🧾 FACTURACIÓN       ⚙️ CONFIGURACIÓN          │
│  (desperdicios)     (electrónica DIAN)    (usuarios, impresora)      │
│                                                                       │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
                        🔄 Sincroniza
                        cada 5 minutos
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    📱 APP MÓVIL DEL DUEÑO                             │
│──────────────────────────────────────────────────────────────────────│
│                                                                       │
│  💰 Ventas hoy    🟢 Cajeros     ⚠️ Alertas     📋 Cuentas cobro   │
│  📊 Reportes      📦 Inventario  🕐 Turnos      🤝 Consignación    │
│  🔔 Notificaciones push (stock, turnos, faltantes, cuentas vencidas) │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions

> [!IMPORTANT]
> **¿Factura inmediata o al cobrar?** Cuando el cliente paga con "Cuenta de cobro", ¿la factura electrónica DIAN se emite al momento de la venta o cuando el cliente finalmente paga? La norma DIAN da máximo 24 horas. Necesitamos definir el comportamiento por defecto.

> [!IMPORTANT]
> **¿Cómo se mide el nivel de tinta?** ¿El cajero/admin ingresa manualmente el porcentaje del tóner periódicamente? ¿O se estima puramente por conteo de copias desde el último cambio de tóner (más automático pero menos preciso)?

> [!WARNING]
> **Consignación y facturación DIAN:** Cuando se vende un producto en consignación, ¿la factura electrónica sale a nombre del negocio (cafetería) o a nombre de la empresa dueña del producto? Esto afecta cómo se configura en Factus.

> [!NOTE]
> **Alquiler y facturación:** ¿Se genera factura electrónica DIAN por el alquiler de un PC o una sala? ¿O solo un recibo interno? Esto depende del régimen tributario del negocio.
