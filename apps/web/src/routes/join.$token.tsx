import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import { AuthCard } from "#/components/auth-card";
import { apiClient } from "#/lib/api-client";
import { getSession } from "#/lib/server-auth";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/join/$token")({
  beforeLoad: async ({ params }) => {
    const session = await getSession();
    if (!session) {
      return { error: null };
    }

    let team: Awaited<ReturnType<typeof apiClient.joinTeamByToken>> | null = null;
    let joinError: string | null = null;
    try {
      team = await apiClient.joinTeamByToken(params.token);
    } catch (error) {
      joinError = error instanceof Error ? error.message : String(error);
    }

    if (team) {
      throw redirect({ to: "/teams/$teamId", params: { teamId: team.id } });
    }
    return { error: joinError };
  },
  component: JoinTeamPage,
});

function JoinTeamPage() {
  const { token } = Route.useParams();
  const { error } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Music2 className="size-6" />
        SongVerse
      </div>
      {error ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Couldn't join this team</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Sign in or create an account to accept this team invite.
          </p>
          <AuthCard redirectTo={`/join/${token}`} />
        </>
      )}
    </main>
  );
}
