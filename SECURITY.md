# Políticas de Seguridad — MiCafé POS

## Reporte de vulnerabilidades

Si encontrás una vulnerabilidad, reportala a: [tu-email]  
**No abras un issue público.**

## Prácticas de seguridad

### Autenticación y Autorización
- Firebase Authentication con email/contraseña
- Roles: `admin`, `cajero`, `marketing`
- Verificación de rol en cada operación administrativa (`verificarEsAdmin()`)
- Guards de ruta: `AdminGuard`, `MarketingGuard`

### Firestore Security Rules
- `firestore.rules` desplegado en Firebase Console
- Acceso granular por colección, basado en rol del usuario
- Eventos: lectura pública, escritura admin/marketing
- Auditoría: append-only, solo admin lee
- Fallback: todo bloqueado por defecto

### Secretos
- Variables de entorno: `.env.local` (gitignored), `.env.example` (commiteado sin valores)
- API Keys de terceros (Google Maps, Wompi) via `NEXT_PUBLIC_*`
- Credenciales de Firebase: públicas por diseño (client SDK), protegidas por reglas de Firestore

### Datos sensibles
- `registradoPor` en compras/mermas vinculado a `auth.currentUser.uid`
- Sin PII en logs ni URLs
- Auditoría de acciones administrativas en colección `auditoria_logs`

### Backup
- Firestore ofrece exportación desde GCP Console
- Se recomienda exportación semanal

### Dependencias
- `npm audit` antes de cada release
- Dependabot configurado para PRs automáticos de seguridad (`.github/dependabot.yml`)

### Headers HTTP (Vercel)
Agregar en `next.config.mjs`:
```
headers: async () => [
  {
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  },
]
```
