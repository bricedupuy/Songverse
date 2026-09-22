import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/admin/storage")({
  loader: async () => {
    const [stats, config] = await Promise.all([apiClient.adminStorageStats(), apiClient.adminGetStorageConfig()]);
    return { stats, config };
  },
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
  const router = useRouter();
  const { stats, config } = Route.useLoaderData();

  const [accountId, setAccountId] = useState(config.accountId ?? "");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucket, setBucket] = useState(config.bucket ?? "");
  const [endpoint, setEndpoint] = useState(config.endpoint ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  async function saveConfig() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.adminSaveStorageConfig({
        accountId: accountId.trim() || undefined,
        accessKeyId: accessKeyId.trim() || undefined,
        secretAccessKey: secretAccessKey.trim() || undefined,
        bucket: bucket.trim() || undefined,
        endpoint: endpoint.trim() || undefined,
      });
      setAccessKeyId("");
      setSecretAccessKey("");
      await router.invalidate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clearConfig() {
    setClearing(true);
    try {
      await apiClient.adminClearStorageConfig();
      setAccountId("");
      setBucket("");
      setEndpoint("");
      await router.invalidate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

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
          <CardTitle className="text-sm">{t("admin.storageConfigTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("admin.storageConfigDescription")}</p>
          <p className="text-xs">
            <span className="font-medium">{t("admin.storageConfigSource")}: </span>
            <span className="text-muted-foreground">
              {config.source === "database"
                ? t("admin.storageConfigSourceDatabase")
                : config.source === "env"
                  ? t("admin.storageConfigSourceEnv")
                  : t("admin.storageConfigSourceNone")}
            </span>
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storage-account-id">{t("admin.storageAccountId")}</Label>
              <Input id="storage-account-id" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storage-bucket">{t("admin.storageBucket")}</Label>
              <Input id="storage-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="songverse" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storage-access-key-id">{t("admin.storageAccessKeyId")}</Label>
              <Input
                id="storage-access-key-id"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={config.accessKeyIdMasked ?? t("admin.storageRequired")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storage-secret-access-key">{t("admin.storageSecretAccessKey")}</Label>
              <Input
                id="storage-secret-access-key"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={config.hasDatabaseConfig ? t("admin.storageLeaveBlankToKeep") : t("admin.storageRequired")}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="storage-endpoint">{t("admin.storageEndpoint")}</Label>
              <Input
                id="storage-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={t("admin.storageEndpointPlaceholder")}
              />
            </div>
          </div>

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

          <div className="flex items-center justify-between">
            <Button onClick={() => void saveConfig()} disabled={saving}>
              {saving ? t("admin.storageSaving") : t("admin.storageSaveConfig")}
            </Button>
            {config.hasDatabaseConfig ? (
              confirmingClear ? (
                <div className="flex items-center gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void clearConfig()} disabled={clearing}>
                    {clearing ? t("admin.storageClearing") : t("admin.storageConfirmClear")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmingClear(false)} disabled={clearing}>
                    {t("admin.cancel")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmingClear(true)}>
                  {t("admin.storageClearConfig")}
                </Button>
              )
            ) : null}
          </div>
        </CardContent>
      </Card>

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
