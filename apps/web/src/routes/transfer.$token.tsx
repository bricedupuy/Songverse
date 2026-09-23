import { DEFAULT_LOCALE, type TransferPreview } from "@songverse/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import { useMemo, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { AuthCard } from "#/components/auth-card";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { apiClient } from "#/lib/api-client";
import { formatBytes } from "#/lib/format-bytes";
import { createI18n } from "#/lib/i18n";
import { getSession } from "#/lib/server-auth";

export const Route = createFileRoute("/transfer/$token")({
  beforeLoad: async ({ params }) => {
    const session = await getSession();
    if (!session) {
      const { hasGoogleAuth } = await apiClient.getAuthPublicConfig();
      return { locale: DEFAULT_LOCALE, email: null, preview: null, error: null, hasGoogleAuth };
    }
    const base = { locale: session.locale, email: session.email, hasGoogleAuth: false };
    try {
      return { ...base, preview: await apiClient.getTransfer(params.token), error: null };
    } catch (error) {
      return { ...base, preview: null, error: error instanceof Error ? error.message : String(error) };
    }
  },
  component: TransferPage,
});

// Outside the _protected layout, so it has to supply its own i18n instance.
function TransferPage() {
  const { locale } = Route.useRouteContext();
  const i18n = useMemo(() => createI18n(locale), [locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <TransferContent />
    </I18nextProvider>
  );
}

function TransferContent() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const { email, preview, error, hasGoogleAuth } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Music2 className="size-6" />
        SongVerse
      </div>
      {!email ? (
        <>
          <p className="max-w-sm text-center text-sm text-muted-foreground">{t("transfer.signInPrompt")}</p>
          <AuthCard redirectTo={`/transfer/${token}`} hasGoogleAuth={hasGoogleAuth} />
        </>
      ) : preview ? (
        <ClaimCard token={token} email={email} preview={preview} />
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("transfer.unavailableTitle")}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/dashboard">{t("transfer.goToDashboard")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function ClaimCard({ token, email, preview }: { token: string; email: string; preview: TransferPreview }) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await apiClient.claimTransfer(token);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const items = [
    t("transfer.songs", { count: preview.songCount }),
    t("transfer.arrangements", { count: preview.arrangementCount }),
    t("transfer.songbooks", { count: preview.songbookCount }),
    t("transfer.tags", { count: preview.tagCount }),
    t("transfer.sets", { count: preview.setCount }),
    t("transfer.files", { size: formatBytes(preview.storageBytes) }),
  ];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("transfer.title")}</CardTitle>
        <CardDescription>{t("transfer.description", { name: preview.fromDisplayName })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {done ? (
          <>
            <p className="text-sm">{t("transfer.accepted")}</p>
            <Button asChild>
              <Link to="/library">{t("transfer.goToLibrary")}</Link>
            </Button>
          </>
        ) : (
          <>
            <ul className="list-disc pl-5 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("transfer.expires", { date: new Date(preview.expiresAt).toLocaleDateString(i18n.language) })}{" "}
              {t("transfer.acceptInto", { email })}
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={() => void accept()} disabled={pending}>
              {pending ? t("transfer.accepting") : t("transfer.accept")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
