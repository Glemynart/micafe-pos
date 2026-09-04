const expectedProjects = Object.freeze({
  production: "micafe-pos",
  staging: "micafe-pos-staging",
});

const environment = process.env.POS_DEPLOY_ENV;

if (environment !== "production" && environment !== "staging") {
  console.error("POS_DEPLOY_ENV debe ser exactamente 'production' o 'staging'.");
  process.exit(1);
}

const configuredProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const expectedProjectId = expectedProjects[environment];

if (configuredProjectId !== expectedProjectId) {
  console.error(`El Firebase project ID no corresponde a POS_DEPLOY_ENV=${environment}.`);
  process.exit(1);
}

console.log(`Configuración POS validada para ${environment}.`);
