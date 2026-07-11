import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const testEnv = await initializeTestEnvironment({
  projectId: "x-reply-intelligence-rules-test",
  firestore: {
    host: process.env.FIRESTORE_EMULATOR_HOST?.split(":")[0] || "127.0.0.1",
    port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(":")[1] || 8080),
    rules: fs.readFileSync("firestore.rules", "utf8"),
  },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "candidatePosts/post1"), {
      text: "候補",
      hardFilter: { passed: true },
      status: "candidate",
    });
    await setDoc(doc(db, "creatorProfiles/reiya-public-x"), { displayName: "れいちぇる" });
    await setDoc(doc(db, "xConnections/user1"), { encryptedAccessToken: "secret" });
  });

  const anonDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonDb, "candidatePosts/post1")));
  await assertFails(getDoc(doc(anonDb, "creatorProfiles/reiya-public-x")));
  await assertFails(getDoc(doc(anonDb, "xConnections/user1")));

  const userDb = testEnv.authenticatedContext("user1", { admin: false }).firestore();
  await assertFails(getDoc(doc(userDb, "candidatePosts/post1")));
  await assertFails(getDoc(doc(userDb, "creatorProfiles/reiya-public-x")));
  await assertFails(setDoc(doc(userDb, "watchListSettings/user1_list"), { listId: "1" }));
  await assertFails(getDoc(doc(userDb, "xConnections/user1")));

  const adminDb = testEnv.authenticatedContext("admin1", { admin: true }).firestore();
  await assertSucceeds(getDoc(doc(adminDb, "candidatePosts/post1")));
  await assertSucceeds(getDoc(doc(adminDb, "creatorProfiles/reiya-public-x")));
  await assertSucceeds(setDoc(doc(adminDb, "watchListSettings/admin1_list"), { listId: "1", name: "list" }));
  await assertFails(getDoc(doc(adminDb, "xConnections/user1")));
  await assertFails(getDoc(doc(adminDb, "xOAuthStates/state1")));
  await assertFails(getDoc(doc(adminDb, "xApiUsageLogs/log1")));
  await assertFails(getDoc(doc(adminDb, "timelineSyncStates/state1")));

  console.log("Firestore rules checks passed.");
} finally {
  await testEnv.cleanup();
}
