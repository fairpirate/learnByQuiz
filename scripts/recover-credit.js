import "dotenv/config";
import {
  initializeApp,
  applicationDefault,
  deleteApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository } from "../server/repository.js";
const [uid, id, flag] = process.argv.slice(2);
if (
  !uid ||
  uid.includes("/") ||
  uid.length > 128 ||
  !/^[a-f0-9-]{36}$/i.test(id || "") ||
  (flag && flag !== "--apply")
)
  throw new Error(
    "Usage: npm run recover:credit -- <uid> <reservationUUID> [--apply]",
  );
const app = initializeApp({
  credential: applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const db = getFirestore(app),
  repo = new FirestoreRepository(db);
try {
  const result = await db.runTransaction(async (tx) => {
    const reservationRef = repo.ref(uid, "creditReservations", id),
      walletRef = repo.ref(uid, "billing", "wallet");
    const [reservation, execution, wallet] = await Promise.all([
      tx.get(reservationRef),
      tx.get(repo.ref(uid, "executions", id)),
      tx.get(walletRef),
    ]);
    if (!reservation.exists) throw new Error("Reservation not found.");
    const value = reservation.data(),
      state = execution.exists ? execution.data().status : "missing";
    const diagnostic = {
      reservationId: id,
      reservationStatus: value.status,
      executionStatus: state,
      applied: false,
    };
    if (value.status !== "RESERVED") return diagnostic;
    const age = Date.now() - Date.parse(value.createdAt);
    if (!Number.isFinite(age) || age < 15 * 60 * 1000)
      throw new Error(
        "Reservation must be at least 15 minutes old. Wait for active work to finish.",
      );
    if (!["completed", "failed", "missing"].includes(state))
      throw new Error(
        "Execution is still running. Stop the originating process and review its saved content before marking it failed in Firestore.",
      );
    const target = state === "completed" ? "CONSUMED" : "RELEASED";
    if (flag === "--apply") {
      if (!wallet.exists)
        throw new Error(
          "Wallet missing; manual accounting review is required.",
        );
      tx.update(reservationRef, {
        status: target,
        recoveredAt: new Date().toISOString(),
      });
      if (target === "RELEASED")
        tx.update(walletRef, { balance: wallet.data().balance + 1 });
    }
    return {
      ...diagnostic,
      proposedStatus: target,
      applied: flag === "--apply",
    };
  });
  console.info(JSON.stringify(result, null, 2));
} finally {
  await db.terminate();
  await deleteApp(app);
}
