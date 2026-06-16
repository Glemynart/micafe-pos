# PROJECT_DISCOVERY.md

> Estado actual del repositorio relevado el 2026-06-15.  
> Solo documenta lo que existe — sin propuestas de cambio.

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

**Modo web:** Next.js sirve el mismo código como PWA. Service Worker activo. Se puede desplegar en Vercel o cualquier hosting estático.

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
| Firebase Cloud Messaging | Notificaciones push |
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

### Módulos de administración web (`app/admin/`)
Rutas protegidas bajo `/admin/(authenticated)/`.

| Ruta | Función |
|------|---------|
| `/admin` | Dashboard principal |
| `/admin/usuarios` | Gestión de usuarios |
| `/admin/permisos` | Roles y permisos |
| `/admin/turnos` | Historial de turnos |
| `/admin/compras` | Registro de compras |
| `/admin/mermas` | Registro de mermas |
| `/admin/egresos` | Gastos |
| `/admin/cuentas-cobro` | Cuentas por cobrar |
| `/admin/reportes` | Reportes |
| `/admin/espacios` | Configuración de espacios |
| `/admin/eventos` | Gestión de eventos |

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
ventas-service.ts         compras-service.ts
turnos-service.ts         mermas-service.ts
reservas-service.ts       egresos-service.ts
reportes-service.ts       liquidaciones-service.ts
finanzas-service.ts       cuentas-cobro-service.ts
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
  rol: "admin" | "cajero" | "cocinero" | "marketing"
  activo: boolean
  permisos: string[]          // anulaciones individuales sobre los del rol
  fcmTokens: string[]         // tokens de notificación push
  ultimoAcceso: Timestamp
  creadoEn: Timestamp
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
  capacidad: number
  espacioId: string
  activo: boolean
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
  fechaInicio: string       // ISO string
  fechaFin: string
  estadoPago: "pendiente" | "pagado" | "fallido"
  estadoReserva: "activa" | "completada" | "cancelada"
  montoTotal: number
  referenciaPago: string    // ID de transacción Wompi
  fechaCreacion: string
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
  update_url: string        // URL codificada con XOR para auto-updater
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
Cajero abre turno (base de caja)
  → Selecciona espacio activo (EspaciosContext)
  → SellModule: agrega productos al carrito
  → Selecciona método de pago
  → ventas-service.ts persiste Venta en Firestore
  → Stock de productos se decrementa
  → Insumos de recetas se decrementan (si aplica)
  → Al cierre: turno registra totales + diferencia de efectivo
```

### 3. Reserva pública
```
Usuario visita /reservar
  → Selecciona espacio, mesa, fecha y hora
  → mesas-service verifica disponibilidad en Firestore
  → Redirige a Wompi para pago
  → Wompi envía webhook a /api/webhooks/wompi
  → API verifica firma HMAC-SHA256
  → Actualiza estadoPago en Firestore a "pagado"
  → FCM envía notificación push a admins
```

### 4. Notificaciones push
```
Evento relevante ocurre (reserva, alerta, etc.)
  → /api/notifications/send recibe título + mensaje
  → Firebase Admin SDK envía FCM a todos los tokens registrados en usuarios
  → FcmManagerWrapper en cliente registra/actualiza token por usuario
```

### 5. Auto-actualización (Electron)
```
App arranca
  → auto-updater.js consulta GitHub Releases (o update_url de Firestore)
  → Si hay versión mayor → descarga .exe en background
  → Notifica al usuario → reinicio instala la actualización
```

### 6. Gestión de inventario con recetas
```
Venta de un ítem con receta
  → recetas-service obtiene ingredientes de la receta
  → Por cada ingrediente: decrementa stock en insumos-service
  → Merma: si stock queda negativo, se registra automáticamente
```

### 7. Turno con cierre ciego
```
Cajero abre turno → ingresa base
  → Durante el turno: ventas se suman en tiempo real
  → Cierre: cajero declara efectivo físico (sin ver el esperado)
  → Sistema calcula diferencia (totalReportado - totalEsperado)
  → Turno se cierra y queda registrado en Firestore
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
- Sidebar con módulos habilitados por rol
- 17 módulos cargados dinámicamente
- Soporte dark/light theme

---

## APIs detectadas

### `POST /api/webhooks/wompi`
- **Propósito:** Recibir notificaciones de pago de Wompi
- **Seguridad:** Verificación de firma HMAC-SHA256 con `WOMPI_EVENTS_SECRET`
- **Acción:** Actualiza `estadoPago` de la reserva en Firestore

### `POST /api/notifications/send`
- **Propósito:** Enviar notificación push a todos los admins
- **Body:** `{ title: string, message: string }`
- **Mecanismo:** Firebase Admin SDK → FCM multicast a tokens registrados

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
  └── Insumo
  └── Receta (usa Insumos)
```

### Operaciones
```
Turno
  └── Venta
        └── Items (Producto o Receta)
        └── Cliente (opcional)
  └── Egreso
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
  └── Referencia de pago Wompi
```

### Configuración y seguridad
```
Usuario
  └── Rol (admin | cajero | cocinero | marketing)
  └── Permisos (anulaciones individuales)
  └── FCM Tokens

Permisos_roles
  └── Documento por rol con array de permisos

Audit Log
  └── Acciones sensibles registradas

Configuración
  └── Módulos habilitados
  └── Consecutivo de ventas
  └── URL de actualización
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
| `ventas` | Transacciones de venta |
| `turnos` | Turnos de caja |
| `reservas` | Reservas de clientes |
| `compras` | Compras a proveedores |
| `proveedores` | Proveedores |
| `mermas` | Registro de mermas |
| `egresos` | Gastos operativos |
| `clientes` | Perfiles de clientes |
| `cuentas_cobro` | Cuentas por cobrar |
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

# Firebase (servidor / Admin SDK)
FIREBASE_SERVICE_ACCOUNT          # JSON del service account

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
