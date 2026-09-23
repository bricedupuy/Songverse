import { DEFAULT_LOCALE, type SetInvitePreview } from "@songverse/core";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Music2 } from "lucide-react";
import { useMemo, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { AuthCard } from "#/components/auth-card";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { apiClient } from "#/lib/api-client";
import { createI18n } from "#/lib/i18n";
import { getSession } from "#/lib/server-auth";
import { setlistTitle } from "#/lib/setlists";

/** Where a set's share link leads: sign in if needed, then join the set as a guest. */
export const Route = createFileRoute("/set-invite/$token")({
  beforeLoad: async ({ params }) => {
    const session = await getSession();
    let preview: SetInvitePreview | null = null;
    let error: string | null = null;
    try {
      preview = await apiClient.getSetInvite(params.token);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const hasGoogleAuth = session ? false : (await apiClient.getAuthPublicConfig()).hasGoogleAuth;
    return { locale: session?.locale ?? DEFAULT_LOCALE, signedIn: !!session, preview, error, hasGoogleAuth };
  },
  component: SetInvitePage,
});

// Outside the _protected layout, so it has to supply its own i18n instance.
function SetInvitePage() {
  const { locale } = Route.useRouteContext();
  const i18n = useMemo(() => createI18n(locale), [locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <SetInviteContent />
    </I18nextProvider>
  );
}

function SetInviteContent() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const { signedIn, preview, error, hasGoogleAuth } = Route.useRouteContext();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Music2 className="size-6" />
        SongVerse
      </div>
      {!preview ? (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("sets.joinUnavailableTitle")}</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          {signedIn ? (
            <CardContent>
              <Button asChild>
                <Link to="/sets">{t("sets.goToSets")}</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <>
          <InviteCard token={token} preview={preview} signedIn={signedIn} />
          {!signedIn ? (
            <>
              <p className="max-w-sm text-center text-sm text-muted-foreground">{t("sets.joinSignInPrompt")}</p>
              <AuthCard redirectTo={`/set-invite/${token}`} hasGoogleAuth={hasGoogleAuth} />
            </>
          ) : null}
        </>
      )}
    </main>
  );
}

function InviteCard({ token, preview, signedIn }: { token: string; preview: SetInvitePreview; signedIn: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setPending(true);
    setError(null);
    try {
      const { setlistId } = await apiClient.joinSetInvite(token);
      await navigate({ to: "/sets/$setlistId", params: { setlistId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{setlistTitle(preview, t, i18n.language)}</CardTitle>
        <CardDescription>
          {preview.teamName
            ? t("sets.joinDescriptionTeam", { team: preview.teamName })
            : t("sets.joinDescription", { name: preview.ownerName ?? "" })}{" "}
          {t("sets.joinSongs", { count: preview.itemCount })}
        </CardDescription>
      </CardHeader>
      {signedIn ? (
        <CardContent className="flex flex-col gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => void join()} disabled={pending}>
            {pending ? t("sets.joining") : t("sets.join")}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
