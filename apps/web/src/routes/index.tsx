import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">SongVerse</h1>
      <p className="text-neutral-600">Phase 1 foundation — auth, teams, and library skeleton.</p>

      {isPending ? (
        <p>Loading session…</p>
      ) : session?.user ? (
        <div className="flex items-center gap-4">
          <p>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <Link to="/dashboard" className="text-blue-600 underline">
            Go to dashboard
          </Link>
          <button
            className="rounded border px-3 py-1"
            onClick={() => {
              void authClient.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <SignInForm />
      )}
    </main>
  );
}

function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(mode: "signin" | "signup", formEl: HTMLFormElement) {
    setError(null);
    setLoading(true);

    const form = new FormData(formEl);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "");

    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(event) => event.preventDefault()}>
      <input name="name" placeholder="Display name (sign up only)" className="border p-2" />
      <input name="email" type="email" placeholder="Email" required className="border p-2" />
      <input name="password" type="password" placeholder="Password" required minLength={8} className="border p-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={(event) => submit("signin", event.currentTarget.form!)}
          className="rounded border px-3 py-1"
        >
          Sign in
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={(event) => submit("signup", event.currentTarget.form!)}
          className="rounded border px-3 py-1"
        >
          Sign up
        </button>
      </div>
    </form>
  );
}
