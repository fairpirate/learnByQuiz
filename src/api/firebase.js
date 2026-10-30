import { auth } from "../config/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
export async function handleRegister(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}
export async function handleLogin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}
