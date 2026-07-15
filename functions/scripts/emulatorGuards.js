const { assertDemoWriteEnvironment } = require("../src/environmentSafety");

function assertEmulatorOnly() {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "")) {
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must point to localhost.");
  }
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) {
    throw new Error("FIRESTORE_EMULATOR_HOST must point to localhost.");
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
  if (!projectId.startsWith("demo-")) {
    throw new Error("Emulator local projectId must start with demo-.");
  }
  process.env.GCLOUD_PROJECT = projectId;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;
  process.env.FIREBASE_CONFIG = JSON.stringify({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  });
  process.env.X_API_MOCK_MODE = "true";
  if (process.env.ALLOW_REAL_OPENAI_WITH_EMULATOR !== "true") {
    process.env.OPENAI_MOCK_MODE = "true";
  } else {
    process.env.OPENAI_MOCK_MODE = process.env.OPENAI_MOCK_MODE === "false" ? "false" : "true";
  }
  assertDemoWriteEnvironment(process.env);
}

module.exports = { assertEmulatorOnly };
