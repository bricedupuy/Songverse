import type { StorageLimits } from "@songverse/core";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { formatBytes } from "#/lib/format-bytes";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ConfirmButton } from "#/components/confirm-button";

export const Route = createFileRoute("/_protected/admin/storage")({
  loader: async () => {
    const [stats, config, limits] = await Promise.all([
      apiClient.adminStorageStats(),
      apiClient.adminGetStorageConfig(),
      apiClient.adminGetStorageLimits(),
    ]);
    return { stats, config, limits };
  },
  component: AdminStoragePage,
});

function AdminStoragePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { stats, config, limits } = Route.useLoaderData();

  const [accountId, setAccountId] = useState(config.accountId ?? "");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucket, setBucket] = useState(config.bucket ?? "");
  const [endpoint, setEndpoint] = useState(config.endpoint ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

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
              <ConfirmButton
                label={t("admin.storageClearConfig")}
                confirmLabel={t("admin.storageConfirmClear")}
                busyLabel={t("admin.storageClearing")}
                cancelLabel={t("admin.cancel")}
                busy={clearing}
                onConfirm={clearConfig}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <StorageLimitsCard limits={limits} />

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

/** Kept apart from the R2 card: saving or reverting one never touches the other. */
function StorageLimitsCard({ limits }: { limits: StorageLimits }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState(String(limits.defaultLimitMb));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(defaultLimitMb: number | null) {
    setPending(true);
    setError(null);
    try {
      await apiClient.adminSaveStorageLimits(defaultLimitMb);
      await router.invalidate();
      if (defaultLimitMb === null) setValue(String(limits.builtInDefaultMb));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("admin.storageLimitsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("admin.storageLimitsDescription")}</p>
        <p className="text-xs">
          <span className="font-medium">{t("admin.storageConfigSource")}: </span>
          <span className="text-muted-foreground">
            {limits.isBuiltIn ? t("admin.storageLimitsSourceBuiltIn") : t("admin.storageLimitsSourceDatabase")}
          </span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default-storage-limit">{t("admin.storageDefaultLimitLabel")}</Label>
          <Input
            id="default-storage-limit"
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="max-w-40"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center justify-between">
          <Button onClick={() => void save(parsed)} disabled={pending || !valid}>
            {pending ? t("admin.saving") : t("admin.save")}
          </Button>
          {limits.isBuiltIn ? null : (
            <Button variant="outline" size="sm" onClick={() => void save(null)} disabled={pending}>
              {t("admin.resetToBuiltIn", { mb: limits.builtInDefaultMb })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
