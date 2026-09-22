import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_protected/admin/storage")({
  loader: () => apiClient.adminStorageStats(),
  component: AdminStoragePage,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function AdminStoragePage() {
  const { t } = useTranslation();
  const stats = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("nav.adminStorage")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.storageDescription")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold leading-none">
              {stats.driver === "s3" ? t("admin.storageDriverS3") : t("admin.storageDriverLocal")}
            </p>
            <p className="text-sm text-muted-foreground">{t("admin.storageDriver")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold leading-none">{stats.attachmentCount}</p>
            <p className="text-sm text-muted-foreground">{t("admin.storageAttachmentCount")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold leading-none">{formatBytes(stats.totalBytes)}</p>
            <p className="text-sm text-muted-foreground">{t("admin.storageTotalSize")}</p>
          </CardContent>
        </Card>
      </div>

      {stats.driver === "local" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t("admin.storageLocalWarning")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.storageByType")}</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.byType).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.storageNoAttachments")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {Object.entries(stats.byType).map(([type, count]) => (
                <li key={type} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                  <span className="font-medium">{type}</span>
                  <span className="text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
