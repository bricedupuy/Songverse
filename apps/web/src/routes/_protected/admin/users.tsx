import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Card, CardContent } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/admin/users")({
  loader: () => apiClient.adminListUsers(),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation();
  const users = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("nav.adminUsers")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.usersDescription")}</p>
      </div>

      <Card>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">
                    {user.displayName}
                    {user.isGlobalAdmin ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("admin.globalAdmin")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{t("admin.userStats", { teams: user.teamCount, songs: user.songCount })}</p>
                  <p>{new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
