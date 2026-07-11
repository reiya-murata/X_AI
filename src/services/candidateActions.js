import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, firebaseEnabled } from "../lib/firebase";

export async function markCandidateOpened(postId) {
  if (!firebaseEnabled || !db || !postId) return;
  await updateDoc(doc(db, "candidatePosts", postId), {
    status: "opened",
    openedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
