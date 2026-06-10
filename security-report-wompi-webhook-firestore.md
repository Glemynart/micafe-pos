# Security Finding: Wompi Webhook Firestore Authorization Failure

**Severity:** CRITICAL  
**Component:** `app/api/webhooks/wompi/route.ts`  
**Affected Collection:** `reservas` (Firestore)  
**Firestore Rules:** `firestore.rules:156–159`  
**Date:** 2026-06-08  
**Finding ID:** SEC-001

---

## 1. Summary

The Wompi payment webhook handler uses the Firebase **client SDK** (`firebase/firestore`) to mark reservations as paid. Because the handler runs in a server-side Next.js API route — where no Firebase Auth user is signed in — every `updateDoc()` call is rejected by Firestore security rules (`request.auth == null`). The webhook returns HTTP 500 to Wompi, which retries until exhaustion. **The reservation document is never updated, and payments are never reconciled.**

---

## 2. Technical Root Cause

### 2.1 Client SDK Is Used in a Server-Side Context

```typescript
// app/api/webhooks/wompi/route.ts:3–4
import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore, doc, updateDoc } from "firebase/firestore"

// Lines 7–17
const firebaseConfig = { /* NEXT_PUBLIC_* env vars */ }
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const db = getFirestore(app)
```

The `firebase/firestore` SDK is a **client-side** SDK. It operates in the context of the currently signed-in Firebase Auth user. Inside a Next.js API route handler (server-side code), there is no signed-in user.

### 2.2 Firestore Rules Require Authentication

```javascript
// firestore.rules:156–159
match /reservas/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

Both `read` and `write` are gated on `request.auth != null`. Since no user is signed in when the webhook handler executes, `request.auth` is `null` and the write is denied.

### 2.3 Error Handling Returns 500, Triggering Wompi Retry

```typescript
// route.ts:66–78
try {
  const reservaRef = doc(db, 'reservas', reservaId)
  await updateDoc(reservaRef, {
    estadoPago: 'pagado',
    referenciaPago: transaction.id
  })
} catch (dbError) {
  console.error(`Error actualizando Firebase para la reserva ${reservaId}:`, dbError)
  return NextResponse.json({ error: 'Failed to update DB' }, { status: 500 })
}
```

When Firestore rejects the write with a permissions error, the client SDK throws (rejected promise). The inner `catch` block catches it and returns HTTP 500. Wompi treats any non-2xx response as a transient failure and **retries** the webhook delivery.

---

## 3. Attack / Exploit Scenario (Proof of Concept)

### 3.1 Preconditions

- The Firestore `reservas` collection exists and security rules are deployed as shown above.
- The Wompi integration is configured with a valid `WOMPI_EVENTS_SECRET`.
- A customer creates a reservation through the landing page (writes to `reservas/{id}` with `estadoPago: 'pendiente'` via a client with a signed-in user — or an anonymous user if the landing page allows unauthenticated writes; regardless, the write back via webhook fails).

### 3.2 Step-by-Step Exploitation

| Step | Actor | Action | Result |
|------|-------|--------|--------|
| 1 | Customer | Creates reservation via landing page | Document `reservas/{id}` created with `estadoPago: 'pendiente'` |
| 2 | Customer | Completes Wompi checkout; real money debited | Wompi processes payment, status = `APPROVED` |
| 3 | Wompi | Sends `transaction.updated` webhook to `POST /api/webhooks/wompi` | HTTP request arrives at the route handler |
| 4 | Route (line 26–28) | Validates `event === 'transaction.updated'` | Passes |
| 5 | Route (lines 38–58) | Validates HMAC-SHA256 signature | Passes (secret is configured) |
| 6 | Route (line 61) | Checks `transaction.status === 'APPROVED'` | Passes |
| 7 | Route (line 68) | `updateDoc(reservaRef, { estadoPago: 'pagado', ... })` | **Firestore evaluates security rules** |
| 8 | Firestore | Evaluates `request.auth != null` | **`request.auth` is `null` → Permission denied** |
| 9 | Client SDK | Receives `PERMISSION_DENIED` error | Promise rejects |
| 10 | Route (line 73–77) | `catch (dbError)` → returns HTTP 500 | `{ error: 'Failed to update DB' }` with status 500 |
| 11 | Wompi | Receives HTTP 500 | Schedules retry (exponential backoff) |
| 12 | Wompi | Retries N times (steps 3–11 repeat) | **Every retry fails identically** |
| 13 | Wompi | Retries exhausted | Webhook delivery permanently failed |
| 14 | Firestore | Document `reservas/{id}` | **Still `estadoPago: 'pendiente'`** |
| 15 | Café staff | Views reservation dashboard | Payment shown as **unpaid** |

### 3.3 Error Log Observed on the Server

```
Error actualizando Firebase para la reserva RECV-ABC123: FirebaseError: [code=permission-denied]:
  Missing or insufficient permissions.
```

### 3.4 Business Impact

| Severity | Description |
|----------|-------------|
| **CRITICAL** | Real money is collected from customers but the café has no record of payment. |
| **CRITICAL** | Every paid reservation is stuck in `pendiente` state indefinitely. |
| **HIGH** | Customer disputes and chargebacks due to non-delivery of reserved services. |
| **HIGH** | Wompi webhook retry storm — repeated 500 errors for every transaction. |
| **MEDIUM** | Reputational damage and loss of customer trust. |

---

## 4. Affected Code Paths

```
POST /api/webhooks/wompi
  → route.ts:19  POST()
    → route.ts:61  transaction.status === 'APPROVED'
      → route.ts:67  doc(db, 'reservas', reservaId)
        → route.ts:68  updateDoc(reservaRef, { estadoPago: 'pagado', ... })
          → Firestore rules:156–159  →  PERMISSION_DENIED (request.auth == null)
            → route.ts:73  catch(dbError)  →  500
```

All server-side code paths that use the Firebase client SDK to write to Firestore are potentially affected. This includes:

- `app/api/webhooks/wompi/route.ts` — **confirmed broken**
- `lib/permisos-service.ts` — uses client SDK, may fail in server context
- `lib/audit-service.ts` — uses client SDK
- Any script using `initializeApp(firebaseConfig)` — may fail if run in non-browser context with auth-required rules

---

## 5. Remediation

### 5.1 Recommended Fix: Firebase Admin SDK

Replace the client SDK with `firebase-admin`, which bypasses security rules and runs with full service-account privileges:

```typescript
// app/api/webhooks/wompi/route.ts — FIXED
import { cert, initializeApp, getApps, getApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Initialize admin SDK (idempotent)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  })
}

const db = getFirestore()

// Inside the POST handler:
await db.collection('reservas').doc(reservaId).update({
  estadoPago: 'pagado',
  referenciaPago: transaction.id
})
```

### 5.2 Alternative: Relax Firestore Rules for Webhooks

Add a condition that allows writes from a trusted service account or a shared secret. This is less secure and **not recommended**.

### 5.3 Verification

After applying the fix, verify by:

1. Deploy updated code
2. Create a test reservation with `estadoPago: 'pendiente'`
3. Trigger a Wompi webhook (or simulate with matching signature)
4. Confirm the Firestore document is updated to `estadoPago: 'pagado'`
5. Confirm the route returns HTTP 200
6. Monitor Wompi dashboard for zero webhook delivery failures

---

## 6. References

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Wompi Webhook Documentation](https://docs.wompi.co/docs/eventos-webhooks)
- [Firebase Security Rules — `request.auth`](https://firebase.google.com/docs/rules/rules-language#authentication)
- Project file: `app/api/webhooks/wompi/route.ts`
- Project file: `firestore.rules`
- Project file: `lib/firebase.ts`
