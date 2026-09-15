import { createFileRoute } from "@tanstack/react-router";
import { apiClient } from "#/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/dashboard")({
  loader: async ({ context }) => {
    const [me, teams] = await Promise.all([apiClient.getMe(), apiClient.listTeams()]);
    return { session: context.session, me, teams };
  },
  component: Dashboard,
});

function Dashboard() {
  const { session, me, teams } = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session.displayName}</h1>
        <p className="text-sm text-muted-foreground">{session.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">/users/me (via NestJS API, bearer token)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(me, null, 2)}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">/teams</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(teams, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
