import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-p2-03-storage";
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";
const [host, port] = STORAGE_HOST.split(":");

let environment: RulesTestEnvironment;

const image = (size = 16) => new Uint8Array(size);

function storageFor(context: RulesTestContext) {
  return context.storage();
}

type StorageReference = ReturnType<ReturnType<RulesTestContext["storage"]>["ref"]>;

function putObject(object: StorageReference, data: Uint8Array, contentType: string) {
  return new Promise<void>((resolve, reject) => {
    const task = object.put(data, { contentType });
    task.on("state_changed", undefined, reject, resolve);
  });
}

async function seedObject(objectPath: string, contentType = "image/png", size = 16) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await putObject(storageFor(context).ref(objectPath), image(size), contentType);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host,
      port: Number(port),
      rules: await readFile(path.resolve(process.cwd(), "storage.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearStorage();
});

after(async () => {
  await environment.cleanup();
});

test("Storage: el tenant propietario puede escribir y leer imágenes de productos", async () => {
  const adminA = environment.authenticatedContext("admin-a", { empresaId: "empresa-a", rol: "admin" });
  const objectPath = "tenants/empresa-a/productos/cafeteria/producto-a.png";
  const object = storageFor(adminA).ref(objectPath);
  const anonimo = environment.unauthenticatedContext();

  await assertSucceeds(putObject(object, image(), "image/png"));
  await assertSucceeds(object.getMetadata());
  await assertFails(storageFor(anonimo).ref(objectPath).getMetadata());
});

test("Storage: un tenant distinto no puede leer, escribir ni eliminar assets privados", async () => {
  const adminA = environment.authenticatedContext("admin-a", { empresaId: "empresa-a", rol: "admin" });
  const adminB = environment.authenticatedContext("admin-b", { empresaId: "empresa-b", rol: "admin" });
  const objectPath = "tenants/empresa-a/productos/cafeteria/producto-a.png";

  await seedObject(objectPath);
  await assertFails(storageFor(adminB).ref(objectPath).getMetadata());
  await assertFails(putObject(storageFor(adminB).ref(objectPath), image(), "image/png"));
  await assertFails(storageFor(adminB).ref(objectPath).delete());

  const publicObjectPath = "tenants/empresa-a/eventos/evento-a/portada.png";
  await assertFails(putObject(storageFor(adminB).ref(publicObjectPath), image(), "image/png"));
});

test("Storage: el contenido público permite lectura anónima, pero no escritura anónima", async () => {
  const adminA = environment.authenticatedContext("admin-a", { empresaId: "empresa-a", rol: "admin" });
  const anonimo = environment.unauthenticatedContext();
  const objectPath = "tenants/empresa-a/eventos/evento-a/portada.png";

  await assertSucceeds(putObject(storageFor(adminA).ref(objectPath), image(), "image/png"));
  await assertSucceeds(storageFor(anonimo).ref(objectPath).getMetadata());
  await assertFails(putObject(storageFor(anonimo).ref(objectPath), image(), "image/png"));
});

test("Storage: el rol de marketing puede gestionar contenido público de su tenant", async () => {
  const marketingA = environment.authenticatedContext("marketing-a", { empresaId: "empresa-a", rol: "marketing" });
  const cajeroA = environment.authenticatedContext("cajero-a", { empresaId: "empresa-a", rol: "cajero" });
  const objectPath = "tenants/empresa-a/marketing/campana-a/imagen.png";

  await assertSucceeds(putObject(storageFor(marketingA).ref(objectPath), image(), "image/png"));
  await assertFails(storageFor(cajeroA).ref(objectPath).delete());
});

test("Storage: tamaño y tipo MIME son controles del contrato", async () => {
  const adminA = environment.authenticatedContext("admin-a", { empresaId: "empresa-a", rol: "admin" });
  const basePath = "tenants/empresa-a/productos/cafeteria";

  await assertFails(putObject(storageFor(adminA).ref(`${basePath}/texto.txt`), image(), "text/plain"));
  await assertFails(putObject(storageFor(adminA).ref(`${basePath}/grande.png`), image(5 * 1024 * 1024 + 1), "image/png"));
  await assertSucceeds(putObject(storageFor(adminA).ref(`${basePath}/limite.png`), image(5 * 1024 * 1024), "image/png"));
});

test("Storage: rutas globales legacy y rutas desconocidas quedan rechazadas", async () => {
  const adminA = environment.authenticatedContext("admin-a", { empresaId: "empresa-a", rol: "admin" });

  await assertFails(putObject(storageFor(adminA).ref("productos/cafeteria/legacy.png"), image(), "image/png"));
  await assertFails(putObject(storageFor(adminA).ref("tenants/empresa-a/desconocido/asset.png"), image(), "image/png"));
});

test("Storage: una sesión sin empresaId no puede mutar rutas tenant-aware", async () => {
  const sinTenant = environment.authenticatedContext("sin-tenant", { rol: "admin" });
  const objectPath = "tenants/empresa-a/productos/cafeteria/producto-a.png";

  await assertFails(putObject(storageFor(sinTenant).ref(objectPath), image(), "image/png"));
});
