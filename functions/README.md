# Functions de autenticación SaaS

Esta unidad contiene el backend privilegiado de MT-U5A. El cliente nunca lee ni escribe credenciales operativas: invoca `autenticarOperativo`, recibe un Custom Token y completa la sesión con Firebase Authentication.

## Configuración local y despliegue

Firebase no tiene un proyecto implícito en este repositorio. Las únicas
selecciones admitidas son `production` (`micafe-pos`) y `staging`
(`micafe-pos-staging`). Nunca ejecute un deploy sin `--project` ni use un alias
`default`.

1. Configure el secreto de servidor, sin registrarlo en archivos `.env` ni en Git:

   ```bash
   firebase functions:secrets:set OPERATIONAL_PIN_PEPPER --project <staging|production>
   ```

2. Compile las funciones:

   ```bash
   npm run build:functions
   ```

3. Para emular, seleccione el ambiente explícitamente:

   ```bash
   npm run emu:staging
   npm run emu:production
   ```

4. Para desplegar Functions o Rules, use únicamente los scripts explícitos:

   ```bash
   npm run deploy:functions:staging
   npm run deploy:functions:production
   npm run deploy:rules:staging
   npm run deploy:rules:production
   ```

Vercel debe configurar `POS_DEPLOY_ENV=staging` o `POS_DEPLOY_ENV=production`
junto con las variables `NEXT_PUBLIC_FIREBASE_*` del mismo ambiente. Su build
ejecuta un guard que falla si el proyecto Firebase no coincide. STG-02 no
configura Dusema, secretos S2S, claves S2S ni ninguna llamada POS → Dusema.

La función se ejecuta en `us-central1` salvo que `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` especifique otra región para el cliente.

## Credenciales operativas

Una credencial se identifica por un código operativo normalizado y un PIN numérico de seis dígitos. El PIN se guarda exclusivamente como hash bcrypt con el secreto `OPERATIONAL_PIN_PEPPER`; la contraseña de Firebase no es un PIN y nunca se reutiliza para este propósito.

`provisionarCredencialOperativa` requiere una sesión con claims `empresaId` y `rol: admin`. `rotarPinOperativo` requiere que el usuario autenticado valide su PIN vigente. Ambos flujos invalidan las sesiones emitidas previamente para el usuario afectado.
