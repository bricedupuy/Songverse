import { NOTIFICATION_KINDS, type MyNotificationPreferences, type NotificationKind } from "@songverse/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { apiClient } from "#/lib/api-client";

/**
 * How each kind of notification reaches one besides the bell (issue #236):
 * by email, each kind on or off, saved as it's changed. When this server
 * doesn't email notifications (Admin > Notifications), it says so.
 */
export function NotificationSettingsCard() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<MyNotificationPreferences | null>(null);

  useEffect(() => {
    void apiClient.getMyNotificationPreferences().then(setPreferences);
  }, []);

  const change = async (kind: NotificationKind, email: boolean) => {
    if (!preferences) return;
    // Shown at once; the answer is what was saved.
    setPreferences({ ...preferences, kinds: { ...preferences.kinds, [kind]: { ...preferences.kinds[kind], email } } });
    setPreferences(await apiClient.updateMyNotificationPreferences({ kinds: { [kind]: { email } } }));
  };

  return (
    <Card id="notifications" data-testid="notification-settings" data-ready={preferences ? "true" : undefined}>
      <CardHeader>
        <CardTitle className="text-sm">{t("notifications.settingsTitle")}</CardTitle>
        <CardDescription>{t("notifications.settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {preferences && !preferences.emailAvailable ? (
          <p className="text-xs text-muted-foreground" data-testid="notification-email-off">
            {t("notifications.emailOff")}
          </p>
        ) : null}
        <div className="flex items-center justify-end text-xs font-medium text-muted-foreground">{t("notifications.channelEmail")}</div>
        <ul className="flex flex-col gap-2">
          {NOTIFICATION_KINDS.map((kind) => (
            <li key={kind}>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>{t(`notifications.kindLabels.${kind}`)}</span>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={preferences?.kinds[kind].email ?? false}
                  disabled={!preferences?.emailAvailable}
                  onChange={(event) => void change(kind, event.target.checked)}
                  data-testid={`notify-email-${kind}`}
                />
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
