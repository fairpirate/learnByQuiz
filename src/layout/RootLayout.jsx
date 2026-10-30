import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
import useQuestionStore from "../store/zustand";
import Navbar from "../components/Navbar/Navbar";
import { Outlet } from "react-router-dom";
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const authUser = useQuestionStore((s) => s.authUser);
  const logoutUser = useQuestionStore((s) => s.logoutUser);
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) {
          const previous = useQuestionStore.getState().auth;
          if (previous.id && previous.id !== user.uid) logoutUser();
          authUser({ email: user.email, id: user.uid });
        } else logoutUser();
        setReady(true);
      }),
    [authUser, logoutUser],
  );
  return (
    <main className="bg-neutral-50 font-Inter">
      <Navbar />
      <div className="p-5 md:py-10 md:px-10 overflow-hidden">
        {ready ? <Outlet /> : <p role="status">Restoring your session…</p>}
      </div>
    </main>
  );
}
