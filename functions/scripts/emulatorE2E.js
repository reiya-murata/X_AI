const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { assertEmulatorOnly } = require("./emulatorGuards");
const { buildSeedDocuments } = require("../src/seed");
const { syncTimeline } = require("../src/x/syncTimeline");
const { mockConnection } = require("../src/x/mockFixtures");

async function main() {
  assertEmulatorOnly();
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = admin.firestore();
  const uid = "emulator-e2e-admin";

  await cleanupE2EData(db, uid);
  await seedMissing(db);

  const firstHome = await syncTimeline({
    db,
    admin,
    firebaseUid: uid,
    sourceType: "home_timeline",
    connection: { xUserId: mockConnection.xUserId },
    accessToken: "mock-access-token",
  });
  assert.equal(firstHome.success, true);
  assert.equal(firstHome.fetchedCount, 6);
  assert.equal(firstHome.savedCount, 2);
  assert.equal(firstHome.excludedCount, 4);

  const firstDoc = await db.collection("candidatePosts").doc("1810000000000000001").get();
  assert.equal(firstDoc.exists, true);
  assert.equal(firstDoc.data().status, "candidate");
  assert.deepEqual(firstDoc.data().sourceTypes, ["home_timeline"]);
  assert.equal(firstDoc.data().metrics.impressions, 12000);
  const firstDiscoveredAt = firstDoc.data().firstDiscoveredAt.toMillis();

  await db.collection("candidatePosts").doc("1810000000000000001").set({ status: "opened" }, { merge: true });
  const secondHome = await syncTimeline({
    db,
    admin,
    firebaseUid: uid,
    sourceType: "home_timeline",
    connection: { xUserId: mockConnection.xUserId },
    accessToken: "mock-access-token",
  });
  assert.equal(secondHome.success, true);
  const openedDoc = await db.collection("candidatePosts").doc("1810000000000000001").get();
  assert.equal(openedDoc.data().status, "opened");
  assert.equal(openedDoc.data().firstDiscoveredAt.toMillis(), firstDiscoveredAt);

  const listRun = await syncTimeline({
    db,
    admin,
    firebaseUid: uid,
    sourceType: "watch_list",
    listId: "1234567890123456789",
    connection: { xUserId: mockConnection.xUserId },
    accessToken: "mock-access-token",
  });
  assert.equal(listRun.success, true);
  const mergedDoc = await db.collection("candidatePosts").doc("1810000000000000002").get();
  assert.ok(mergedDoc.data().sourceTypes.includes("home_timeline"));
  assert.ok(mergedDoc.data().sourceTypes.includes("watch_list"));

  const [candidateSnap, filteredSnap, runsSnap, usageSnap, statesSnap] = await Promise.all([
    db.collection("candidatePosts").where("status", "in", ["candidate", "opened"]).get(),
    db.collection("candidatePosts").where("status", "==", "filtered_out").get(),
    db.collection("searchRuns").where("firebaseUid", "==", uid).get(),
    db.collection("xApiUsageLogs").where("firebaseUid", "==", uid).get(),
    db.collection("timelineSyncStates").where("firebaseUid", "==", uid).get(),
  ]);

  console.log(JSON.stringify({
    ok: true,
    firstHome,
    secondHome,
    listRun,
    candidateIds: candidateSnap.docs.map((doc) => doc.id),
    filteredIds: filteredSnap.docs.map((doc) => doc.id),
    counts: {
      candidates: candidateSnap.size,
      filtered: filteredSnap.size,
      searchRuns: runsSnap.size,
      usageLogs: usageSnap.size,
      syncStates: statesSnap.size,
    },
  }, null, 2));
}

async function seedMissing(db) {
  const docs = buildSeedDocuments();
  for (const item of docs) {
    const ref = db.collection(item.collection).doc(item.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.set({
        ...item.data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
}

async function cleanupE2EData(db, uid) {
  const mockPostIds = [
    "1810000000000000001",
    "1810000000000000002",
    "1810000000000000003",
    "1810000000000000004",
    "1810000000000000005",
    "1810000000000000006",
    "1810000000000000007",
  ];
  const refs = mockPostIds.map((postId) => db.collection("candidatePosts").doc(postId));
  const [runs, usageLogs, states] = await Promise.all([
    db.collection("searchRuns").where("firebaseUid", "==", uid).get(),
    db.collection("xApiUsageLogs").where("firebaseUid", "==", uid).get(),
    db.collection("timelineSyncStates").where("firebaseUid", "==", uid).get(),
  ]);
  const batch = db.batch();
  refs.forEach((ref) => batch.delete(ref));
  runs.docs.forEach((doc) => batch.delete(doc.ref));
  usageLogs.docs.forEach((doc) => batch.delete(doc.ref));
  states.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
