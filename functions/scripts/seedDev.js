const admin = require("firebase-admin");
const { buildSeedDocuments } = require("../src/seed");

admin.initializeApp();

async function main() {
  const db = admin.firestore();
  const docs = buildSeedDocuments();
  let inserted = 0;

  for (const item of docs) {
    const ref = db.collection(item.collection).doc(item.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.set({
        ...item.data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      inserted += 1;
    }
  }

  console.log(`Inserted ${inserted} missing seed documents. Existing documents were left untouched.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
