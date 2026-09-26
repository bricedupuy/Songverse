import { createFileRoute, redirect } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import { useEffect } from "react";
import { AuthCard } from "#/components/auth-card";
import { LocaleProvider } from "#/components/locale-provider";
import { apiClient } from "#/lib/api-client";
import { loadAppData } from "#/lib/app-data";
import { forgetOffline } from "#/lib/offline-db";
import { getVisitorLocale } from "#/lib/server-auth";
import { loadLocale } from "#/lib/i18n";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Through the app data, which offline falls back to the session kept on the device.
    const session = (await loadAppData())?.session;
    if (session) {
      throw redirect({ to: "/library" });
    }
    const [{ hasGoogleAuth }, locale] = await Promise.all([apiClient.getAuthPublicConfig(), getVisitorLocale()]);
    return { hasGoogleAuth, locale: await loadLocale(locale) };
  },
  component: Home,
});

function Home() {
  const { hasGoogleAuth, locale } = Route.useRouteContext();
  // Signed out: nothing of the last user's stays on the device (issue #49).
  useEffect(() => void forgetOffline(), []);
  return (
    <LocaleProvider locale={locale}>
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Music2 className="size-6" />
          Songverse
        </div>
        <AuthCard hasGoogleAuth={hasGoogleAuth} />
      </main>
    </LocaleProvider>
  );
}
