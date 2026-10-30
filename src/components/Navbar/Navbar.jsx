import { Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth as firebaseAuth } from "../../config/firebase";
import useQuestionStore from "../../store/zustand";

function Navbar() {
  const { auth, logoutUser } = useQuestionStore();

  return (
    <nav className="w-full bg-transparent text-neutral-900 px-5 md:px-10 flex items-center justify-between py-5 text-sm border-b-slate-200 border">
      <h1 className="text-green-400 text-2xl font-bold tracking-tight flex items-center gap-1">
        Quiz 2 Learn
        {/* <div className="w-2 h-2 bg-red-500 mt-2 ml-1 rounded-full" /> */}
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        {auth?.email && (
          <>
            <Link to="/">Classic Quiz</Link>
            <Link className="font-semibold text-green-700" to="/journey">
              AI Learning Journey
            </Link>
          </>
        )}
        {!auth?.email && (
          <Link
            className="py-2 px-5 text-green-400 font-semibold border rounded-full border-green-400"
            to={"/login"}
          >
            Login
          </Link>
        )}
        {auth?.email ? (
          <button
            className="py-2 transition px-5 text-neutral-50 font-semibold rounded-full bg-red-600"
            onClick={async () => {
              await signOut(firebaseAuth);
              logoutUser();
            }}
          >
            Logout
          </button>
        ) : (
          <Link
            className="py-2 transition px-5 text-neutral-50 font-semibold rounded-full bg-green-400"
            to={"/register"}
          >
            Register
          </Link>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
