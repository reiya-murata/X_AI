const admin = require("../functions/node_modules/firebase-admin");
const { assertEmulatorOnly } = require("../functions/scripts/emulatorGuards");

const EMAIL = process.env.LOCAL_ADMIN_EMAIL || "dev-admin@local.test";
const PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || "local-dev-only";
const DISPLAY_NAME = process.env.LOCAL_ADMIN_DISPLAY_NAME || "Local Admin";
const ADMIN_CLAIM = { admin: true };

async function main() {
  assertEmulatorOnly();
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Emulator hosts are required.");
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
  if (!projectId.startsWith("demo-")) {
    throw new Error("demo- projectId is required for local admin seed.");
  }

  admin.initializeApp({ projectId });
  const auth = admin.auth();
  let created = false;
  let updated = false;
  let user;

  try {
    user = await auth.getUserByEmail(EMAIL);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true,
    });
    await auth.setCustomUserClaims(user.uid, ADMIN_CLAIM);
    created = true;
    console.log(JSON.stringify({ ok: true, status: "created", email: EMAIL, uid: user.uid }, null, 2));
    return;
  }

  const currentClaims = (await auth.getUser(user.uid)).customClaims || {};
  const claimChanged = currentClaims.admin !== true;
  const displayNameChanged = user.displayName !== DISPLAY_NAME;
  const passwordChanged = true;
  if (claimChanged || displayNameChanged || passwordChanged) {
    await auth.updateUser(user.uid, {
      displayName: displayNameChanged ? DISPLAY_NAME : user.displayName,
      password: PASSWORD,
    });
    await auth.setCustomUserClaims(user.uid, { ...currentClaims, ...ADMIN_CLAIM });
    updated = true;
  }

  console.log(JSON.stringify({
    ok: true,
    status: created ? "created" : updated ? "updated" : "unchanged",
    email: EMAIL,
    uid: user.uid,
    adminClaim: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
