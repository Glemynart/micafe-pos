import { firebaseConfig } from "@/lib/firebase-config";
import { crearFirebasePushServiceWorker } from "@/lib/firebase-push-service-worker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const script = crearFirebasePushServiceWorker(firebaseConfig);
    return new Response(script, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Content-Type": "application/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Firebase Web Push configuration is unavailable.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
