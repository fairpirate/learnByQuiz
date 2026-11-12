import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
export default function NotFound() {
  const error = useRouteError();
  const notFound =
    !error || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-2xl font-bold text-slate-800">
        {notFound ? "We couldn't find this page" : "We couldn't open this page"}
      </h1>
      <p className="text-slate-600">
        {notFound
          ? "The link may have changed. Go back to the home page to continue."
          : "Something went wrong while loading. Please try again."}
      </p>
      {!notFound && (
        <button
          className="rounded-full bg-green-700 px-5 py-2 text-white"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      )}
      <Link to="/" className="text-green-700 underline">
        Go to home page
      </Link>
    </div>
  );
}
