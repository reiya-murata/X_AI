let connected = false;

export function connectFirebaseEmulators({ auth, db, functions, connectAuthEmulator, connectFirestoreEmulator, connectFunctionsEmulator }) {
  if (connected || import.meta.env.VITE_USE_FIREBASE_EMULATORS !== "true") {
    return { connected };
  }

  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9097", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(
    db,
    import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || "127.0.0.1",
    Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8081),
  );
  connectFunctionsEmulator(
    functions,
    import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1",
    Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5003),
  );
  connected = true;
  return { connected };
}
