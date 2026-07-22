/** Vocabulario puro y canónico de roles tenant. */
export const ROLES_TENANT = [
  "admin",
  "supervisor",
  "cajero",
  "cocinero",
  "marketing",
] as const;

export type RolTenant = (typeof ROLES_TENANT)[number];
