import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "#/components/confirm-button";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { apiClient } from "#/lib/api-client";

export const Route = createFileRoute("/_protected/admin/notifications")({
  loader: () => apiClient.adminGetNotificationSettings(),
  component: AdminNotificationsPage,
});

/**
 * Admin > Notifications (issue #236): whether notifications also go by
 * email - off by default, since they go through the same Resend account
 * as account mail, with its sending limits. The setting says where it
 * comes from; a saved one wins over the environment.
 */
function AdminNotificationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const summary = Route.useLoaderData();
  const setting = summary.settings.emailEnabled;
  const [emailEnabled, setEmailEnabled] = useState(setting.value);
  useEffect(() => setEmailEnabled(setting.value), [summary]);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source =
    setting.source === "database" ? t("admin.securityFromDatabase") : setting.source === "env" ? t("admin.securityFromEnv", { name: setting.env }) : t("admin.securityFromDefault", { name: setting.env });

  async function run(action: () => Promise<void>, busy: (on: boolean) => void) {
    busy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("notifications.adminTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("notifications.adminDescription")}</p>
        <p className="mt-2 text-xs" data-testid="notification-settings-source">
          <span className="font-medium">{t("admin.authSource")}: </span>
          <span className="text-muted-foreground">
            {summary.source === "database" ? t("admin.authSourceDatabase") : summary.source === "env" ? t("admin.authSourceEnv") : t("admin.securitySourceDefaults")}
          </span>
        </p>
      </div>

      <Card>
        <CardContent>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-4" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} data-testid="notifications-email-enabled" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("notifications.adminEmail")}</span>
              <span className="text-xs text-muted-foreground">{t("notifications.adminEmailHint")}</span>
              <span className="text-xs text-muted-foreground">{source}</span>
            </span>
          </label>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between">
        <Button
          onClick={() => void run(() => apiClient.adminSaveNotificationSettings(emailEnabled !== setting.value ? { emailEnabled } : {}), setSaving)}
          disabled={saving}
          data-testid="notifications-save"
        >
          {saving ? t("admin.authSaving") : t("admin.authSaveConfig")}
        </Button>
        {summary.source === "database" ? (
          <ConfirmButton
            label={t("admin.authClearConfig")}
            confirmLabel={t("admin.authConfirmClear")}
            busyLabel={t("admin.authClearing")}
            cancelLabel={t("admin.cancel")}
            busy={clearing}
            onConfirm={() => run(() => apiClient.adminClearNotificationSettings(), setClearing)}
          />
        ) : null}
      </div>
    </div>
  );
}
