const { isMockMode } = require("../x/xApiClient");

async function loadPublicIdentity(db) {
  const profileSnap = await db.collection("creatorProfiles").doc("reiya-public-x").get();
  const rulesSnap = await db.collection("writingRules").doc("sei-x-writing-v1").get();
  const experiencesSnap = await db.collection("experienceLibrary").where("publicUseAllowed", "==", true).get();
  const opinionsSnap = await db.collection("opinionLibrary").where("publicUseAllowed", "==", true).get();
  const instructionsSnap = await db.collection("writerInstructions").where("useForGeneration", "==", true).get().catch(() => ({ docs: [] }));
  const recentSnap = await db.collection("recentContent").orderBy("publishedAt", "desc").limit(20).get().catch(() => ({ docs: [] }));
  if (!profileSnap.exists || !rulesSnap.exists) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  return {
    creatorProfile: profileSnap.data(),
    writingRules: rulesSnap.data(),
    experiences: experiencesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    opinions: opinionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    writerInstructions: instructionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    recentContent: recentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    isMockMode: isMockMode(),
  };
}

module.exports = { loadPublicIdentity };
