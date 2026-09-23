import { createFileRoute, redirect } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import { AuthCard } from "#/components/auth-card";
import { getHasGoogleAuth } from "#/lib/public-auth-flags";
import { getSession } from "#/lib/server-auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session) {
      throw redirect({ to: "/library" });
    }
    return { hasGoogleAuth: await getHasGoogleAuth() };
  },
  component: Home,
});

function Home() {
  const { hasGoogleAuth } = Route.useRouteContext();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Music2 className="size-6" />
        SongVerse
      </div>
      <AuthCard hasGoogleAuth={hasGoogleAuth} />
    </main>
  );
}
