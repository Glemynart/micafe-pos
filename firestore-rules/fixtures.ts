import type { TokenOptions } from "@firebase/rules-unit-testing";

export type RolDeTenant = "admin" | "cajero" | "supervisor" | "cocinero" | "marketing";

export interface FixtureAutenticado {
  uid: string;
  claims: TokenOptions;
}

const tenantFixture = (uid: string, empresaId: string, rol: RolDeTenant): FixtureAutenticado => ({
  uid,
  claims: { empresaId, rol },
});

/**
 * Identidades sintéticas para pruebas de Rules. Los datos del fixture son
 * exclusivamente claims de Firebase Auth; nunca requieren documentos de
 * usuario o membresía en Firestore.
 */
export const fixtures = {
  anonimo: null,
  tenantA: {
    admin: tenantFixture("tenant-a-admin", "empresa-a", "admin"),
    cajero: tenantFixture("tenant-a-cajero", "empresa-a", "cajero"),
    supervisor: tenantFixture("tenant-a-supervisor", "empresa-a", "supervisor"),
    cocinero: tenantFixture("tenant-a-cocinero", "empresa-a", "cocinero"),
    marketing: tenantFixture("tenant-a-marketing", "empresa-a", "marketing"),
  },
  tenantB: {
    admin: tenantFixture("tenant-b-admin", "empresa-b", "admin"),
  },
  superadmin: {
    uid: "saas-superadmin",
    claims: { superadmin: true },
  } satisfies FixtureAutenticado,
} as const;

export type Fixture = FixtureAutenticado | null;
