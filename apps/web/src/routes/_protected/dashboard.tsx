import { createFileRoute } from "@tanstack/react-router";
import { apiClient } from "#/lib/api-client";

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
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>
        Signed in as <strong>{session.displayName}</strong> ({session.email})
      </p>
      <section>
        <h2 className="font-medium">/users/me (via NestJS API, bearer token)</h2>
        <pre className="rounded bg-neutral-100 p-3 text-sm">{JSON.stringify(me, null, 2)}</pre>
      </section>
      <section>
        <h2 className="font-medium">/teams</h2>
        <pre className="rounded bg-neutral-100 p-3 text-sm">{JSON.stringify(teams, null, 2)}</pre>
      </section>
    </main>
  );
}
