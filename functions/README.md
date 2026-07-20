# Functions de autenticación SaaS

Esta unidad contiene el backend privilegiado de MT-U5A. El cliente nunca lee ni escribe credenciales operativas: invoca `autenticarOperativo`, recibe un Custom Token y completa la sesión con Firebase Authentication.

## Configuración local y despliegue

1. Configure el secreto de servidor, sin registrarlo en archivos `.env` ni en Git:

   ```bash
   firebase functions:secrets:set OPERATIONAL_PIN_PEPPER
   ```

2. Compile las funciones:

   ```bash
   npm run build:functions
   ```

3. Para el emulador, use `firebase emulators:start --only functions`. Para desplegar, use `firebase deploy --only functions:saas-auth`.

La función se ejecuta en `us-central1` salvo que `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` especifique otra región para el cliente.

## Credenciales operativas

Una credencial se identifica por un código operativo normalizado y un PIN numérico de seis dígitos. El PIN se guarda exclusivamente como hash bcrypt con el secreto `OPERATIONAL_PIN_PEPPER`; la contraseña de Firebase no es un PIN y nunca se reutiliza para este propósito.

`provisionarCredencialOperativa` requiere una sesión con claims `empresaId` y `rol: admin`. `rotarPinOperativo` requiere que el usuario autenticado valide su PIN vigente. Ambos flujos invalidan las sesiones emitidas previamente para el usuario afectado.
