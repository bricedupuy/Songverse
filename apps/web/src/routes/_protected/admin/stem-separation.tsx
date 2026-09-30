import type { SaveStemSeparationSettingsRequest, StemSeparationTest } from "@songverse/core";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "#/components/confirm-button";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { apiClient } from "#/lib/api-client";

export const Route = createFileRoute("/_protected/admin/stem-separation")({
  loader: async () => {
    const [summary, grants] = await Promise.all([apiClient.adminGetStemSeparation(), apiClient.adminGetStemSeparationGrants()]);
    return { summary, grants };
  },
  component: AdminStemSeparationPage,
});

/**
 * Admin > Stem separation (issue #63): the Demucs server recordings are
 * split on - its address, key and models, a monthly limit - and who may
 * use it: people by email, and teams.
 */
function AdminStemSeparationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { summary, grants } = Route.useLoaderData();
  const initial = () => ({
    apiUrl: summary.apiUrl ?? "",
    apiKey: "",
    fastModel: summary.fastModel,
    hqModel: summary.hqModel,
    hqEnabled: summary.hqEnabled,
    monthlyLimit: summary.monthlyLimit === null ? "" : String(summary.monthlyLimit),
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [summary]);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<StemSeparationTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [granting, setGranting] = useState(false);

  async function run(action: () => Promise<unknown>, setBusy: (busy: boolean) => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function save() {
    // Only what changed: the rest keeps coming from where it does. The key is sent only when one's typed.
    const change: SaveStemSeparationSettingsRequest = {};
    if (form.apiUrl.trim() !== (summary.apiUrl ?? "")) change.apiUrl = form.apiUrl.trim() || null;
    if (form.apiKey) change.apiKey = form.apiKey;
    if (form.fastModel.trim() !== summary.fastModel) change.fastModel = form.fastModel.trim() || null;
    if (form.hqModel.trim() !== summary.hqModel) change.hqModel = form.hqModel.trim() || null;
    if (form.hqEnabled !== summary.hqEnabled) change.hqEnabled = form.hqEnabled;
    const limit = form.monthlyLimit.trim() ? Number(form.monthlyLimit) : null;
    if (limit !== summary.monthlyLimit) change.monthlyLimit = limit;
    void run(() => apiClient.adminSaveStemSeparation(change), setSaving);
  }

  async function testConnection() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await apiClient.adminTestStemSeparation());
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function grantEmail() {
    if (await run(() => apiClient.adminGrantStemSeparation({ email: email.trim(), enabled: true }), setGranting)) setEmail("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.stemTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.stemDescription")}</p>
        <p className="mt-2 text-xs" data-testid="stem-source">
          <span className="font-medium">{t("admin.authSource")}: </span>
          <span className="text-muted-foreground">
            {summary.source === "database" ? t("admin.authSourceDatabase") : summary.source === "env" ? t("admin.authSourceEnv") : t("admin.authSourceNone")}
          </span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.stemServer")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stem-api-url">{t("admin.stemApiUrl")}</Label>
            <Input id="stem-api-url" type="url" value={form.apiUrl} onChange={(event) => setForm({ ...form, apiUrl: event.target.value })} placeholder="https://demucs.example.com" />
            <span className="text-xs text-muted-foreground">{t("admin.stemApiUrlHint")}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stem-api-key">{t("admin.stemApiKey")}</Label>
            <Input
              id="stem-api-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
              placeholder={summary.hasKey ? t("admin.stemApiKeyKeep") : ""}
            />
            <span className="text-xs text-muted-foreground">{t("admin.stemApiKeyNone")}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stem-fast-model">{t("admin.stemFastModel")}</Label>
              <Input id="stem-fast-model" value={form.fastModel} onChange={(event) => setForm({ ...form, fastModel: event.target.value })} className="max-w-60" />
              <span className="text-xs text-muted-foreground">{t("admin.stemFastModelHint")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stem-hq-model">{t("admin.stemHqModel")}</Label>
              <Input id="stem-hq-model" value={form.hqModel} disabled={!form.hqEnabled} onChange={(event) => setForm({ ...form, hqModel: event.target.value })} className="max-w-60" />
              <span className="text-xs text-muted-foreground">{t("admin.stemHqModelHint")}</span>
            </div>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-4" checked={form.hqEnabled} onChange={(event) => setForm({ ...form, hqEnabled: event.target.checked })} data-testid="stem-hq-enabled" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("admin.stemHqEnabled")}</span>
              <span className="text-xs text-muted-foreground">{t("admin.stemHqEnabledHint")}</span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stem-limit">{t("admin.stemMonthlyLimit")}</Label>
            <Input id="stem-limit" type="number" min={1} value={form.monthlyLimit} onChange={(event) => setForm({ ...form, monthlyLimit: event.target.value })} className="max-w-40" />
            <span className="text-xs text-muted-foreground">{t("admin.stemMonthlyLimitHint")}</span>
          </div>
          {summary.hasKey && !summary.signedCallbacks ? <p className="text-xs text-muted-foreground">{t("admin.stemUnsignedCallbacks")}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing || !summary.apiUrl} data-testid="stem-test">
              {testing ? t("admin.stemTesting") : t("admin.stemTest")}
            </Button>
            {test ? (
              <span className={test.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} data-testid="stem-test-result">
                {test.ok ? t("admin.stemTestOk", { models: test.models.models.join(", ") }) : t("admin.stemTestFailed", { error: test.error })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={saving} data-testid="stem-save">
          {saving ? t("admin.authSaving") : t("admin.authSaveConfig")}
        </Button>
        {summary.source === "database" ? (
          <ConfirmButton
            label={t("admin.authClearConfig")}
            confirmLabel={t("admin.authConfirmClear")}
            busyLabel={t("admin.authClearing")}
            cancelLabel={t("admin.cancel")}
            busy={clearing}
            onConfirm={async () => void (await run(() => apiClient.adminClearStemSeparation(), setClearing))}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.stemGrants")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("admin.stemGrantsHint")}</p>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void grantEmail();
            }}
          >
            <div className="flex min-w-60 flex-1 flex-col gap-1.5">
              <Label htmlFor="stem-grant-email">{t("admin.stemGrantEmail")}</Label>
              <Input id="stem-grant-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <Button type="submit" disabled={granting || !email.trim()} data-testid="stem-grant-add">
              {t("admin.stemGrantAdd")}
            </Button>
          </form>
          {grants.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.stemGrantNoUsers")}</p>
          ) : (
            <ul className="flex flex-col divide-y" data-testid="stem-grant-users">
              {grants.users.map((user) => (
                <li key={user.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {user.displayName} <span className="text-muted-foreground">{user.email}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" disabled={granting} onClick={() => void run(() => apiClient.adminGrantStemSeparation({ email: user.email, enabled: false }), setGranting)}>
                    {t("admin.stemGrantRemove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("admin.stemGrantTeams")}</span>
            {grants.teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.stemGrantNoTeams")}</p>
            ) : (
              grants.teams.map((team) => (
                <label key={team.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={team.canSeparateStems}
                    disabled={granting}
                    onChange={(event) => void run(() => apiClient.adminGrantStemSeparation({ teamId: team.id, enabled: event.target.checked }), setGranting)}
                    data-testid={`stem-grant-team-${team.id}`}
                  />
                  <span className="text-sm">{team.name}</span>
                </label>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
