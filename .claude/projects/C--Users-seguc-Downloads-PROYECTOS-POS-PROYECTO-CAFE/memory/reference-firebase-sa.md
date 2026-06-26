---
name: reference-firebase-sa
description: Location of Firebase Admin SDK service account key file for running migration scripts
metadata:
  type: reference
---

Firebase Admin service account key file is at the project root:
`micafe-pos-firebase-adminsdk-fbsvc-643a7af602.json`

Used by migration scripts via:
```
FIREBASE_SERVICE_ACCOUNT_PATH=./micafe-pos-firebase-adminsdk-fbsvc-643a7af602.json npx tsx scripts/<script>.ts
```
