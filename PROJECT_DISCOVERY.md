# PROJECT_DISCOVERY.md

> Estado actual del repositorio relevado el 2026-06-26.  
> Solo documenta lo que existe — sin propuestas de cambio.

---

## Historial de correcciones

### 2026-06

#### FASE-13 PR3 — Separación de cuentas — COMPLETADO

Implementación:
- `separarCuenta()` en `lib/separar-cuenta-service.ts`: transacción atómica que mueve items (totales o parciales) de un pedido a un nuevo pedido en la misma mesa
- Algoritmo de reparto de `cantidadEnviada` que prioriza mover items no enviados a cocina, preservando el invariante `0 ≤ cantidadEnviada ≤ quantity` en ambos pedidos
- Modelo `MovimientoCuenta` (inmutable) embebido en `PedidoActivo.movimientos[]` para trazabilidad de separaciones, con tipos extensibles (`separacion_origen`, `separacion_destino`)
- `comandaIds` mantiene semántica estricta de relación de creación; las comandas existentes no se modifican durante la separación (cocina completamente desacoplada)
- `SepararCuentaDialog` con selección por item y cantidades parciales (+/-), badges de estado de cocina, validaciones (mínimo 1 item en origen, mínimo 1 seleccionado)
- Selector de cuentas por tabs en `sell-module` (visible solo con 2+ pedidos activos por mesa)
- Panel multi-cuenta en `salon-module` con badges de cocina y botón "Ir" por cada cuenta

Archivos nuevos: `lib/separar-cuenta-service.ts`, `components/pos/separar-cuenta-dialog.tsx`
Archivos modificados: `lib/pedidos-service.ts`, `components/pos/sell-module.tsx`, `components/pos/salon-module.tsx`

Decisiones arquitectónicas:
- **Comandas intactas:** la separación es una operación de facturación, no de cocina. No se crean, modifican ni eliminan comandas.
- **`Timestamp.now()` para `MovimientoCuenta.fecha`:** Firestore prohíbe `serverTimestamp()` dentro de arrays; `actualizadoEn` sigue usando `serverTimestamp()` a nivel superior.
- **Trazabilidad vía `movimientos[]`:** cadena bidireccional recorrible (A.movimientos → B, B.movimientos → A) sin sobrecargar `comandaIds`.

Deuda técnica identificada para PR 4:
- **IMP-1:** Las comandas de items ya enviados que se mueven quedan ancladas al pedido origen. Si PR 4 implementa "trasladar cuenta" a otra mesa, debe diseñar cómo manejar comandas con `nombreMesa` del origen.

#### FASE-13 PR2 — Refactor estructural para múltiples cuentas — COMPLETADO

Implementación:
- `InfoMesa` extendido con `pedidos: PedidoActivo[]` y `displayName` (preparación para N cuentas por mesa)
- `estadoMesa()` agrega ítems y comandas de todos los pedidos de la mesa
- `selectedPedidoId` introducido en `sell-module` junto a `selectedMesaId` con auto-sync
- Bridge desacoplado Salón → POS vía callback props a través de `page.tsx` (consume-once ref pattern)
- Compatibilidad total con el modelo 1 mesa = 1 pedido (sin cambios visibles para el usuario)

Archivos modificados: `lib/salon-service.ts`, `components/pos/salon-module.tsx`, `components/pos/sell-module.tsx`, `app/pos/page.tsx`

Deuda técnica identificada para PR 3 (múltiples cuentas):
- **BR-1:** `pendingNavRef` no tiene invalidación ni expiración. Si el pedido objetivo desaparece (cobrado/eliminado/cambio de espacio) antes de que Firestore lo entregue, el ref queda zombi e inhibe el auto-sync. Enmascarado actualmente por el fallback de `activePedido` por `mesaId`, pero ese fallback deja de cubrir con N cuentas.
- **BR-2:** `pendingPedidoId` en `page.tsx` no se limpia tras el consumo en `SellModule`. Un remount inesperado de `SellModule` (sin cambio de módulo) re-sembraría una navegación stale. Hoy casi inalcanzable; relevante si `TurnoGate` re-alterna sin logout.
- **IMP-1 (auditoría previa):** La limpieza de `selectedPedidoId` en el auto-sync no contempla el caso N>1 pedidos. Si desaparece el pedido apuntado con 2+ cuentas activas, `selectedPedidoId` queda colgante.

#### A-2 Doble reserva — RESUELTO

Implementación:
- Agenda por mesa+día (`agendas/{mesaId}_{YYYY-MM-DD}`)
- Hold transaccional de 15 minutos (claim atómico en `crearReservaConHold`)
- Confirmación idempotente por webhook (fuente autoritativa)
- Liberación automática de holds expirados (expiración perezosa, sin cron)

Archivos modificados: `lib/reservas-service.ts`, `app/reservar/page.tsx`, `app/api/webhooks/wompi/route.ts`  
Commit: `399b11e`

#### Turnos production-ready — RESUELTO

Implementación:
- TurnoGate obligatorio para cajero/supervisor (bloquea POS sin turno activo)
- Candado determinista `turnos_activos/{cajeroId}` evita duplicados
- Fórmula de depósito unificada: `max(0, totalReportado - baseApertura)`
- Cierre ciego (cajero no ve efectivo esperado, solo admin)
- Relevo automático entre cajeros (transacción atómica con 5 validaciones)
- Alerta de faltante configurable + persistencia de conteo detallado

Archivos modificados: `lib/turnos-service.ts`, `components/pos/turno-gate.tsx`, `components/pos/shifts-module.tsx`, `components/pos/global-close-shift.tsx`, `lib/configuracion-service.ts`, `components/pos/settings-module.tsx`, `app/admin/(authenticated)/turnos/page.tsx`

#### Hardening notificaciones PWA — RESUELTO

Implementación:
- Firebase Admin con carga cascada de credenciales (4 métodos)
- Service Worker coexistencia (sw.js + firebase-push-sw.js con whitelist)
- Deep links en notificaciones push (notificationclick navega a URL)
- Helper centralizado `enviarPushAdmins` con purga automática de tokens inválidos
- Push idempotente al admin cuando se confirma reserva vía Wompi

Archivos modificados: `lib/firebase-admin.ts`, `lib/notificaciones-push.ts`, `components/pwa/sw-register.tsx`, `public/firebase-push-sw.js`, `app/api/webhooks/wompi/route.ts`, `app/api/notifications/send/route.ts`

---

## Arquitectura detectada

**Tipo:** Aplicación híbrida Electron + Next.js con landing pública.

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENTE                            │
│                                                         │
│  ┌─────────────────┐   ┌───────────────────────────┐   │
│  │  Electron (Win) │   │     Navegador / Web        │   │
│  │                 │   │                            │   │
│  │  main.js        │   │  Landing  /reservar  /pos  │   │
│  │  preload.js     │   │  /admin/*                  │   │
│  │  src/database.js│   │                            │   │
│  └────────┬────────┘   └────────────┬───────────────┘   │
│           │                         │                   │
│           └──────────┬──────────────┘                   │
│                      │                                  │
│              Next.js App Router                         │
│              (localhost:3000 en dev /                   │
│               out/ estático en prod)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   Firebase (BaaS)            SQLite (local)
   Auth · Firestore            src/database.js
   Storage · FCM               Solo Electron
          │
   API Routes (Next.js)
   /api/webhooks/wompi
   /api/notifications/send
   /api/debug-tokens
```

**Modo escritorio:** Electron carga Next.js estático desde `./out/` vía `electron-serve`. En desarrollo apunta a `http://localhost:3000`.

**Modo web:** Next.js sirve el mismo código como PWA. Service Workers activos: `sw.js` (app-shell cache) + `firebase-push-sw.js` (FCM background messages con deep-links). Se puede desplegar en Vercel o cualquier hosting estático.

---

## Tecnologías utilizadas

### Core
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework web | Next.js (App Router) | 16.2.4 |
| UI | React | 19 |
| Lenguaje | TypeScript | 5.7.3 |
| Estilos | Tailwind CSS v4 + PostCSS | 4.3 |
| Componentes base | shadcn/ui (Radix UI) | — |
| Desktop | Electron | 42.0.1 |

### Backend / Persistencia
| Servicio | Uso |
|---------|-----|
| Firebase Firestore | Base de datos principal (real-time) |
| Firebase Auth | Autenticación de usuarios |
| Firebase Cloud Storage | Archivos e imágenes |
| Firebase Cloud Messaging | Notificaciones push (con deep-links) |
| SQLite (`src/database.js`) | Respaldo local en Electron |

### Integraciones externas
| Servicio | Uso |
|---------|-----|
| Wompi | Pasarela de pago (reservas) |
| Google Maps API / Leaflet | Mapa de ubicación en landing |
| Google Sheets API | Exportación de datos |
| Factus | Facturación electrónica |
| electron-updater + GitHub | Auto-actualización del instalador |

### Librerías notables
- **Forms:** React Hook Form 7.54.1 + Zod 3.24.1
- **Gráficas:** Recharts 2.15.0
- **PDF:** jsPDF, pdf-parse 2.4.5
- **Excel:** ExcelJS 4.4.0
- **Fechas:** date-fns 4.1.0
- **Toasts:** Sonner 1.7.1
- **Seguridad:** bcryptjs 3.0.3, dompurify 3.4.8
- **Notificaciones:** input-otp 1.4.2

---

## Módulos encontrados

### Módulos del POS (`components/pos/`)
Cada módulo se carga dinámicamente (`next/dynamic`, `ssr: false`) desde `/pos`.

| Módulo | Archivo | Función |
|--------|---------|---------|
| Venta | `sell-module.tsx` | Transacciones en caja |
| Inventario | `inventory-module.tsx` | Control de stock |
| Recetas | `recipes-module.tsx` | Combos / recetas con insumos |
| Compras | `purchases-module.tsx` | Órdenes a proveedores |
| Proveedores | `proveedores-module.tsx` + `proveedores-service.ts` | Catálogo tenant-aware para nuevas compras |
| Salón | `salon-module.tsx` | Mapa de mesas con estado derivado y multi-cuenta |
| Cocina | `kitchen-module.tsx` | Pantalla de órdenes para cocina |
| Turnos | `shifts-module.tsx` | Apertura y cierre de caja |
| Mermas | `waste-module.tsx` | Registro de pérdidas |
| Reportes | `reports-module.tsx` | Analítica de ventas |
| Finanzas | `finanzas-module.tsx` | Dashboard financiero |
| Egresos | `egresos-module.tsx` | Control de gastos |
| Cuentas cobro | `cuentas-cobro-module.tsx` | Cuentas por cobrar |
| Clientes | `clientes-module.tsx` | Gestión de clientes |
| Consignaciones | `consignaciones-module.tsx` | Productos en consignación |
| Alquileres | `alquileres-module.tsx` | Renta de espacios |
| Reservas | `reservas-module.tsx` | Gestión de reservas |
| Permisos | `permissions-module.tsx` | Roles y usuarios |
| Configuración | `settings-module.tsx` | Ajustes de la app |

### Componentes transversales del POS
| Componente | Archivo | Función |
|-----------|---------|---------|
| TurnoGate | `turno-gate.tsx` | Bloquea POS hasta que cajero/supervisor abra turno con base declarada |
| Reservas Banner | `reservas-banner.tsx` | Banner persistente en POS con reservas activas/próximas |
| Cierre de Turno | `global-close-shift.tsx` | Modal de cierre de turno al cerrar sesión |
| Separar Cuenta | `separar-cuenta-dialog.tsx` | Diálogo de separación de items entre cuentas |

### Módulos de administración web (`app/admin/`)
Rutas protegidas bajo `/admin/(authenticated)/`.

| Ruta | Función |
|------|---------|
| `/admin` | Dashboard principal |
| `/admin/usuarios` | Gestión de usuarios |
| `/admin/permisos` | Roles y permisos |
| `/admin/turnos` | Historial de turnos (con badge FALTANTE) |
| `/admin/compras` | Registro de compras |
| `/admin/mermas` | Registro de mermas |
| `/admin/egresos` | Gastos |
| `/admin/cuentas-cobro` | Cuentas por cobrar |
| `/admin/reportes` | Reportes |
| `/admin/espacios` | Configuración de espacios |
| `/admin/eventos` | Gestión de eventos |
| `/admin/reservas` | Gestión de reservas |

### Servicios de datos (`lib/`)
Cada servicio encapsula todas las operaciones Firestore de su entidad.

```
auth-service.ts           audit-service.ts
espacios-service.ts       configuracion-service.ts
categorias-service.ts     permisos-service.ts
productos-service.ts      eventos-service.ts
insumos-service.ts        consignadores-service.ts
recetas-service.ts        clientes-service.ts
mesas-service.ts          proveedores-service.ts
salon-service.ts          separar-cuenta-service.ts
ventas-service.ts         compras-service.ts
turnos-service.ts         mermas-service.ts
reservas-service.ts       egresos-service.ts
reportes-service.ts       liquidaciones-service.ts
finanzas-service.ts       cuentas-cobro-service.ts
notificaciones-push.ts
```

---

## Entidades encontradas

### Usuario
```typescript
{
  uid: string
  nombre: string
  username: string            // se convierte a email interno para Firebase Auth
  email: string               // formato: username@micafe-pos.internal
  rol: "admin" | "cajero" | "cocinero" | "marketing" | "supervisor"
  activo: boolean
  permisos: string[]          // anulaciones individuales sobre los del rol
  ultimoAcceso: Timestamp
  creadoEn: Timestamp
  // Campos dinámicos (no en interfaz, gestionados por FcmManager):
  // fcmTokens: string[]      // tokens de notificación push (arrayUnion/arrayRemove)
}
```

### Espacio (Venue)
```typescript
{
  id: string
  nombre: string
  icono: string
  color: string
  activo: boolean
  orden: number
  modulos_permitidos: string[]
}
```

### Categoría
```typescript
{
  id: string
  nombre: string
  espacioId: string
  icono: string
  activo: boolean
  orden: number
}
```

### Producto
```typescript
{
  id: string
  nombre: string
  precio: number
  costo: number
  stock: number
  stockMinimo: number
  imagenUrl: string | null
  categoriaId: string
  espacioId: string
  activo: boolean
  descripcion: string
  unidad: string
  icono: string
  consignadorId?: string
  stockInicial?: number
  creadoEn: Timestamp
  actualizadoEn: Timestamp
}
```

### Mesa / Sala
```typescript
{
  id: string
  nombre: string
  espacioId: string
  activa: boolean
  orden: number
}
```

### Insumo
```typescript
{
  id: string
  nombre: string
  espacioId: string
  stock: number
  unidad: string
  costo: number
  precio: number
  proveedor: string
  activo: boolean
}
```

### Receta
```typescript
{
  id: string
  nombre: string
  espacioId: string
  ingredientes: Array<{ insumoId: string; cantidad: number; unidad: string }>
  precio: number
  costo: number
  activo: boolean
}
```

### PedidoActivo (cuenta de mesa)
```typescript
{
  id: string
  mesaId: string | null            // null = Mostrador/Para llevar
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: PedidoItem[]              // uid, name, quantity, cantidadEnviada, price, cost...
  estado: "abierto" | "pagado" | "cancelado"
  activo: boolean
  comandaIds?: string[]            // relación estricta: comandas creadas por este pedido
  movimientos?: MovimientoCuenta[] // historial inmutable de separaciones
  inicioAlquiler?: number | null
  fechaPago?: Timestamp
  ventaId?: string
  actualizadoEn: Timestamp
}
```

### MovimientoCuenta (registro inmutable de separación)
```typescript
{
  tipo: "separacion_origen" | "separacion_destino"
  pedidoRelacionadoId: string
  items: Array<{ uid: string; name: string; quantity: number }>
  fecha: Timestamp                 // Timestamp.now() — no serverTimestamp (prohibido en arrays)
  cajeroId: string
}
```

### ComandaCocina (instrucción de cocina)
```typescript
{
  id: string
  pedidoId: string                 // FK al pedido que la creó
  mesaId: string | null
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: Array<{ uid: string; name: string; quantity: number; notas?: string }>
  estado: "pendiente" | "en_preparacion" | "listo" | "entregado"
  tipo: "nuevo" | "adicion" | "cancelacion"
  creadoEn: Timestamp
  completadoEn?: Timestamp
}
```

### Venta
```typescript
{
  id: string
  turnoId: string
  cajeroId: string
  espacioId: string
  clienteId?: string
  clienteNombre?: string
  clienteDocumento?: string
  items: Array<{
    id: string
    nombre: string
    cantidad: number
    precioUnitario: number
    costoUnitario: number
    subtotal: number
  }>
  subtotal: number
  iva: number
  impoconsumo: number
  total: number
  metodoPago: "efectivo" | "transferencia" | "cuenta_cobro" | "mixto"
  dineroRecibido?: number
  cambio?: number
  estado: "pagada" | "pendiente"
  fecha: Timestamp
  consecutivo: number
  notasFiado?: string
}
```

### Turno
```typescript
{
  id: string
  cajeroId: string
  cajeroNombre: string
  fechaApertura: Timestamp
  fechaCierre: Timestamp | null
  estado: "abierto" | "cerrado"
  baseApertura: number
  ventasEfectivo: number
  ventasOtrosMetodos: number
  totalEgresos?: number
  totalEsperadoEfectivo: number
  totalReportadoEfectivo: number
  diferenciaEfectivo: number
  notasApertura: string
  notasCierre: string
  esCierreDefinitivo?: boolean              // true = fin de día, false = relevo
  turnoAnteriorId?: string | null           // turno que originó este vía relevo
  relevadoA?: string | null                 // cajeroId del cajero entrante
  alertaFaltante?: boolean                  // true si diferencia < -umbralAlertaFaltante
  conteoDetalle?: Record<string, number>    // desglose por denominación de billete + monedas
}
```

### Reserva
```typescript
{
  id: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  mesaId: string
  espacioId: string
  fechaInicio: string           // ISO string
  fechaFin: string
  fechaLocal?: string           // YYYY-MM-DD (evita recálculo de TZ)
  bloques?: string[]            // claves de hora ["08","09","13"]
  estadoPago: "pendiente" | "pagado" | "fallido"
  estadoReserva: "activa" | "completada" | "cancelada"
  holdExpira?: string | null    // ISO timestamp; null cuando confirmada
  montoTotal: number
  referenciaPago: string        // ID de transacción Wompi
  fechaCreacion: string
}
```

### Agenda (bloque horario por mesa)
```typescript
// Documento: agendas/{mesaId}_{YYYY-MM-DD}
{
  mesaId: string
  fecha: string                 // YYYY-MM-DD
  bloques: Record<string, {     // clave = hora "08", "09", etc.
    reservaId: string
    estado: "hold" | "confirmado"
    holdExpira: string | null
  }>
  actualizadoEn: string
}
```

### Compra
```typescript
{
  id: string
  proveedorId: string
  fecha: Timestamp
  items: Array<unknown>
  total: number
  estado: string
}
```

### Merma
```typescript
{
  id: string
  fecha: Timestamp
  productoId: string
  cantidad: number
  costo: number
  motivo: string
  responsable: string
}
```

### Egreso
```typescript
{
  id: string
  descripcion: string
  monto: number
  fecha: Timestamp
  categoriaEgreso: string
}
```

### Evento
```typescript
{
  id: string
  titulo: string
  descripcion: string
  fecha: string             // YYYY-MM-DD
  hora: string              // HH:MM
  categoria: string
  imagen?: string
  destacado: boolean
  activo: boolean
}
```

### Configuración (documento Firestore)
```
configuracion/general:
  modulos_habilitados: string[]
  consecutivo_actual: number
  update_url: string              // URL codificada con XOR para auto-updater
  baseCajaSugerida: number        // base sugerida al abrir turno (default: 200000)
  umbralAlertaFaltante: number    // umbral para alerta de faltante (default: 20000)
```

---

## Flujos detectados

### 1. Autenticación
```
Usuario ingresa username + password
  → AuthService convierte username a email interno (username@micafe-pos.internal)
  → Firebase signInWithEmailAndPassword
  → Fetch documento /usuarios/{uid} en Firestore
  → AuthContext expone { usuario, rol, permisos }
  → Timeout de 8s como fallback en redes lentas
```

### 2. Flujo de venta en caja
```
Cajero accede a /pos
  → TurnoGate bloquea hasta que declare base de apertura
  → abrirTurno() crea turno + lock en turnos_activos/{cajeroId}
  → Selecciona espacio activo (EspaciosContext)
  → SellModule: agrega productos al carrito
  → Selecciona método de pago
  → ventas-service.ts persiste Venta en Firestore
  → Stock de productos se decrementa
  → Insumos de recetas se decrementan (si aplica)
  → Al cierre: turno registra totales + diferencia de efectivo
```

### 3. Cierre de turno con cierre ciego
```
Cajero cierra sesión o cierra turno desde módulo
  → Modal de cierre muestra conteo por denominación de billetes
  → Cajero declara efectivo físico (no ve el esperado — cierre ciego)
  → Sistema calcula diferencia (totalReportado - totalEsperado)
  → Depósito a caja-principal = max(0, totalReportado - baseApertura)
  → Si diferencia < -umbralAlertaFaltante → alertaFaltante = true
  → Persiste conteoDetalle con desglose por denominación
  → Opción relevo: crea turno B atómicamente para cajero entrante
  → Opción definitivo: cierra y deposita base + efectivo
  → Lock en turnos_activos se elimina
```

### 4. Relevo automático entre cajeros
```
Cajero A cierra turno seleccionando cajero B
  → Transacción atómica valida:
    1. Turno A existe y está abierto
    2. Lock A pertenece al cajero correcto
    3. Usuario B existe en Firestore
    4. B no tiene lock activo (no tiene turno abierto)
  → Cierra turno A (depósito, diferencia, alertas)
  → Crea turno B con misma baseApertura + referencia turnoAnteriorId
  → Crea lock B en turnos_activos/{cajeroB}
  → Todo en una sola transacción Firestore
```

### 5. Reserva pública
```
Usuario visita /reservar
  → Selecciona espacio, mesa, fecha y hora
  → crearReservaConHold() crea hold transaccional en agendas/{mesaId}_{fecha}
  → Hold expira en 15 minutos si no se paga
  → Redirige a Wompi para pago
  → Wompi envía webhook a /api/webhooks/wompi
  → API verifica firma HMAC-SHA256
  → Actualiza estadoPago a "pagado" (idempotente)
  → Confirma bloques de agenda (hold → confirmado)
  → Crea venta + acredita tesorería (bancolombia)
  → Envía notificación push a admins con deep-link a /admin/reservas
```

### 6. Notificaciones push
```
Evento relevante ocurre (reserva confirmada, alerta, etc.)
  → enviarPushAdmins({ title, body, url? }) en servidor
  → Consulta todos los usuarios con rol 'admin'
  → Envía FCM individual a cada token registrado
  → Tokens inválidos se purgan automáticamente (arrayRemove)
  → firebase-push-sw.js recibe mensaje en background
  → notificationclick navega a url (deep-link) o /admin por defecto
  → SwRegister preserva ambos SW (whitelist: sw.js + firebase-push-sw.js)
```

### 7. Auto-actualización (Electron)
```
App arranca
  → auto-updater.js consulta GitHub Releases (o update_url de Firestore)
  → Si hay versión mayor → descarga .exe en background
  → Notifica al usuario → reinicio instala la actualización
```

### 8. Gestión de inventario con recetas
```
Venta de un ítem con receta
  → recetas-service obtiene ingredientes de la receta
  → Por cada ingrediente: decrementa stock en insumos-service
  → Merma: si stock queda negativo, se registra automáticamente
```

---

## Pantallas detectadas

### Landing pública (`/`)
- Sección hero con mapa de ubicación (Leaflet + Google Maps)
- Sección de eventos activos (`eventos-section.tsx`)
- Banner publicitario (`ad-banner.tsx`)
- Navbar con menú móvil y botón de reserva
- Página de términos y condiciones (`/terminos`)

### Sistema de reservas (`/reservar`)
- Selector de espacio y mesa
- Calendario de disponibilidad
- Formulario de datos del cliente
- Integración de pago Wompi
- Splash overlay de carga (`splash-overlay.tsx`)

### Login admin (`/admin/login`)
- Formulario de usuario y contraseña
- Feedback de error de autenticación

### Panel admin (`/admin/*`)
- Layout con sidebar de navegación
- Dashboard con KPIs
- Tablas CRUD para cada entidad
- Exportación a Excel/PDF

### POS (`/pos`)
- Login screen propio dentro del POS
- TurnoGate: pantalla de apertura obligatoria con base sugerida
- Banner de reservas activas/próximas (persistente)
- Sidebar con módulos habilitados por rol
- 17 módulos cargados dinámicamente
- Soporte dark/light theme

---

## APIs detectadas

### `POST /api/webhooks/wompi`
- **Propósito:** Recibir notificaciones de pago de Wompi
- **Seguridad:** Verificación de firma HMAC-SHA256 con `WOMPI_EVENTS_SECRET`
- **Acción:** Actualiza `estadoPago`, confirma bloques de agenda, crea venta, acredita tesorería, envía push a admins
- **Idempotencia:** Ignora webhooks si `estadoPago` ya es `pagado`

### `POST /api/notifications/send`
- **Propósito:** Enviar notificación push a todos los admins
- **Auth:** Bearer token (requiere rol admin o cajero)
- **Body:** `{ title: string, message: string, url?: string }`
- **Respuesta:** `{ success: true, enviados: number, purgados: number }`
- **Mecanismo:** `enviarPushAdmins()` → FCM individual + purga de tokens inválidos

### `GET /api/debug-tokens`
- **Propósito:** Listar usuarios (uso interno / desarrollo)
- **Retorna:** Documentos de la colección `usuarios`

---

## Modelo de datos inferido

### Jerarquía principal
```
Espacio (venue)
  └── Categoría
        └── Producto
  └── Mesa / Sala
        └── Agenda (bloques horarios por día)
  └── Insumo
  └── Receta (usa Insumos)
```

### Operaciones
```
Mesa
  └── PedidoActivo (1:N — múltiples cuentas por mesa)
        ├── Items (con cantidadEnviada para trazabilidad de cocina)
        ├── ComandaCocina (1:N — creadas al enviar a cocina)
        │     └── Items (snapshot del envío)
        ├── MovimientoCuenta[] (historial de separaciones)
        └── Venta (1:1 al cobrar)

Turno
  ├── Venta
  │     └── Items (Producto o Receta)
  │     └── Cliente (opcional)
  ├── Egreso
  └── Lock (turnos_activos/{cajeroId})
```

### Tesorería
```
Cuenta Bancaria (caja-principal, caja-fuerte, bancolombia)
  └── Transacción Financiera
        └── tipo: ingreso | egreso
        └── categoria: ventas | egresos | transferencia_interna
```

### Logística
```
Proveedor
  └── Compra
        └── Items (Producto o Insumo)

Merma
  └── Producto o Insumo afectado

Consignador
  └── Productos en consignación
```

### Reservas
```
Reserva
  └── Mesa
  └── Espacio
  └── Agenda (bloques horarios)
  └── Referencia de pago Wompi
```

### Configuración y seguridad
```
Usuario
  └── Rol (admin | cajero | cocinero | marketing | supervisor)
  └── Permisos (anulaciones individuales)
  └── FCM Tokens (dinámicos, no en interfaz)

Permisos_roles
  └── Documento por rol con array de permisos

Audit Log
  └── Acciones sensibles registradas

Configuración
  └── Módulos habilitados
  └── Consecutivo de ventas
  └── URL de actualización
  └── Base de caja sugerida
  └── Umbral de alerta de faltante
```

### Colecciones Firestore detectadas
| Colección | Descripción |
|-----------|-------------|
| `usuarios` | Usuarios del sistema |
| `espacios` | Venues / espacios |
| `categorias` | Categorías de productos |
| `productos` | Catálogo de productos |
| `insumos` | Insumos / ingredientes |
| `recetas` | Recetas y combos |
| `mesas` | Mesas y salas |
| `pedidos_activos` | Pedidos/cuentas activos por mesa (con movimientos de separación) |
| `comandas_cocina` | Instrucciones de cocina (KDS) vinculadas a pedidos |
| `ventas` | Transacciones de venta |
| `turnos` | Turnos de caja |
| `turnos_activos` | Lock de turno activo por cajero (1 doc = 1 cajero) |
| `reservas` | Reservas de clientes |
| `agendas` | Bloques horarios por mesa+día |
| `compras` | Compras a proveedores |
| `proveedores` | Proveedores |
| `mermas` | Registro de mermas |
| `egresos` | Gastos operativos |
| `clientes` | Perfiles de clientes |
| `cuentas_cobro` | Cuentas por cobrar |
| `cuentas_bancarias` | Cuentas de tesorería (caja-principal, caja-fuerte, bancolombia) |
| `transacciones_financieras` | Movimientos de caja (ingresos/egresos) |
| `liquidaciones` | Liquidaciones / nómina |
| `eventos` | Eventos públicos |
| `consignadores` | Terceros en consignación |
| `permisos_roles` | Permisos por rol |
| `configuracion` | Configuración global de la app |
| `audit_logs` | Registro de auditoría |

---

## Variables de entorno requeridas

```env
# Firebase (cliente)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

# Firebase (servidor / Admin SDK) — carga cascada, usa el primero que encuentre:
FIREBASE_SERVICE_ACCOUNT          # JSON inline del service account
FIREBASE_SERVICE_ACCOUNT_PATH     # Ruta al archivo .json
GOOGLE_APPLICATION_CREDENTIALS    # Ruta estándar GCP (ADC)
# Si ninguno está definido, usa applicationDefault()

# Wompi (pagos)
WOMPI_EVENTS_SECRET                # Firma de webhooks
NEXT_PUBLIC_WOMPI_PUB_KEY

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY
NEXT_PUBLIC_GOOGLE_MAPS_ID
```

---

## Distribución y scripts relevantes

| Script | Comando | Resultado |
|--------|---------|-----------|
| Desarrollo | `npm run dev` | Next.js + Electron en paralelo |
| Solo web | `npm run dev:next` | localhost:3000 |
| Build web | `npm run build` | `./out/` estático |
| Instalador | `npm run dist` | `dist-installer/*.exe` |
| Seed DB | `npm run seed:usuarios` | Usuarios demo en Firestore |

**App ID Electron:** `com.pos.cafe`  
**Nombre instalador:** `MiCafe-POS`  
**Target:** Windows NSIS  
**Repo de actualizaciones:** `Glemynart/micafe-pos` (GitHub Releases)
