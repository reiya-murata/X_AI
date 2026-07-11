const admin = require("firebase-admin");
const { assertEmulatorOnly } = require("./emulatorGuards");

async function main() {
  assertEmulatorOnly();
  const email = process.env.EMULATOR_ADMIN_EMAIL;
  const password = process.env.EMULATOR_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("EMULATOR_ADMIN_EMAIL and EMULATOR_ADMIN_PASSWORD are required.");
  }

  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const auth = admin.auth();
  let user;
  let created = false;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password, emailVerified: true });
    created = true;
  }

  if (!created) {
    await auth.updateUser(user.uid, { password });
  }
  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(JSON.stringify({
    ok: true,
    uid: user.uid,
    email,
    created,
    adminClaim: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
