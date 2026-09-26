import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import type { AdminCommandResult, ArtworkSettings, MetadataSettings } from "@songverse/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { ConfirmButton } from "#/components/confirm-button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";

export const Route = createFileRoute("/_protected/admin/metadata")({
  component: AdminMetadataPage,
});

function ResultPanel({ result }: { result: AdminCommandResult | null }) {
  if (!result) return null;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return (
    <div className="flex flex-col gap-1.5">
      <p className={`text-sm font-medium ${result.ok ? "text-foreground" : "text-destructive"}`}>
        {result.command} — {result.ok ? "done" : "failed"}
      </p>
      {output ? (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{output}</pre>
      ) : null}
    </div>
  );
}

function AdminMetadataPage() {
  const { t } = useTranslation();
  const [statusResult, setStatusResult] = useState<AdminCommandResult | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [seedResult, setSeedResult] = useState<AdminCommandResult | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function checkStatus() {
    setCheckingStatus(true);
    try {
      setStatusResult(await apiClient.adminMigrationStatus());
    } finally {
      setCheckingStatus(false);
    }
  }

  async function runSeed() {
    setSeeding(true);
    try {
      setSeedResult(await apiClient.adminRunSeed());
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("nav.adminMetadata")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("admin.serverAndApi")}</CardTitle>
          <CardDescription>{t("admin.serverAndApiDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("admin.migrationStatus")}</p>
                <p className="text-sm text-muted-foreground">{t("admin.migrationStatusDescription")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void checkStatus()} disabled={checkingStatus}>
                {checkingStatus ? t("admin.checking") : t("admin.checkStatus")}
              </Button>
            </div>
            <ResultPanel result={statusResult} />
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("admin.runSeed")}</p>
                <p className="text-sm text-muted-foreground">{t("admin.runSeedDescription")}</p>
              </div>
              <ConfirmButton
                label={t("admin.runSeed")}
                confirmLabel={t("admin.confirm")}
                busyLabel={t("admin.running")}
                cancelLabel={t("admin.cancel")}
                busy={seeding}
                onConfirm={runSeed}
              />
            </div>
            <ResultPanel result={seedResult} />
          </div>
        </CardContent>
      </Card>

      <MetadataProvidersCard />
      <AppleMusicKeyCard />
      <ArtworkSettingsCard />
    </div>
  );
}

/** Song artwork from Apple Music (issue #85): on or off, the storefront, and finding it for songs without one. */
function ArtworkSettingsCard() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ArtworkSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const apply = (next: ArtworkSettings) => {
    setSettings(next);
    setEnabled(next.enabled);
    setCountry(next.country);
  };
  useEffect(() => {
    apiClient.getArtworkSettings().then(apply).catch(() => {});
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ kind: "ok", text: await action() });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="artwork-settings">
      <CardHeader>
        <CardTitle className="text-sm">{t("artwork.adminTitle")}</CardTitle>
        <CardDescription>{t("artwork.adminDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {settings ? <p className="text-sm text-muted-foreground">{settings.source === "database" ? t("artwork.currentlyDatabase") : t("artwork.currentlyDefault")}</p> : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4" />
          {t("artwork.enabled")}
        </label>
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="artwork-country">{t("artwork.country")}</Label>
          <Input id="artwork-country" value={country} maxLength={2} onChange={(event) => setCountry(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("artwork.countryHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                apply(await apiClient.saveArtworkSettings({ enabled, country }));
                return t("artwork.saved");
              })
            }
          >
            {t("artwork.save")}
          </Button>
          {settings?.source === "database" ? (
            <ConfirmButton
              label={t("artwork.revert")}
              confirmLabel={t("artwork.revertConfirm")}
              busyLabel={t("admin.running")}
              cancelLabel={t("admin.cancel")}
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  apply(await apiClient.resetArtworkSettings());
                  return t("artwork.saved");
                })
              }
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !settings?.enabled}
            onClick={() =>
              void run(async () => {
                const result = await apiClient.backfillArtwork();
                return t("artwork.backfilled", result);
              })
            }
          >
            {busy ? t("artwork.backfilling") : t("artwork.backfill")}
          </Button>
        </div>
        {message ? (
          <p className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Metadata providers (issue #22): which Auto detect asks, and in what order. */
function MetadataProvidersCard() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MetadataSettings | null>(null);
  const [providers, setProviders] = useState<MetadataSettings["providers"]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const apply = (next: MetadataSettings) => {
    setSettings(next);
    setProviders(next.providers);
  };
  useEffect(() => {
    apiClient.getMetadataSettings().then(apply).catch(() => {});
  }, []);

  function move(index: number, by: -1 | 1) {
    setProviders((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(index + by, 0, moved!);
      return next;
    });
  }

  async function run(action: () => Promise<MetadataSettings>) {
    setBusy(true);
    setMessage(null);
    try {
      apply(await action());
      setMessage({ kind: "ok", text: t("metadataProviders.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const currently = settings?.source === "database" ? "currentlyDatabase" : settings?.source === "env" ? "currentlyEnv" : "currentlyDefault";
  return (
    <Card data-testid="metadata-providers">
      <CardHeader>
        <CardTitle className="text-sm">{t("metadataProviders.title")}</CardTitle>
        <CardDescription>{t("metadataProviders.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {settings ? <p className="text-sm text-muted-foreground">{t(`metadataProviders.${currently}`)}</p> : null}
        <ol className="flex flex-col divide-y rounded-md border">
          {providers.map((provider, index) => (
            <li key={provider.key} className="flex items-center gap-3 p-3" data-testid={`provider-${provider.key}`}>
              <span className="w-5 text-sm text-muted-foreground tabular-nums">{index + 1}.</span>
              <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={provider.enabled}
                  aria-label={t("metadataProviders.enabled", { name: provider.name })}
                  onChange={(event) =>
                    setProviders((current) => current.map((p) => (p.key === provider.key ? { ...p, enabled: event.target.checked } : p)))
                  }
                />
                <span className="min-w-0">
                  <span className="font-medium">{provider.name}</span>
                  <span className="block text-xs text-muted-foreground">{t(`metadataProviders.about_${provider.key}`)}</span>
                </span>
              </label>
              <Button variant="ghost" size="icon" aria-label={t("metadataProviders.moveUp", { name: provider.name })} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("metadataProviders.moveDown", { name: provider.name })}
                disabled={index === providers.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void run(() => apiClient.saveMetadataSettings(providers.map(({ key, enabled }) => ({ key, enabled }))))}>
            {t("metadataProviders.save")}
          </Button>
          {settings?.source === "database" ? (
            <ConfirmButton
              label={t("metadataProviders.revert")}
              confirmLabel={t("metadataProviders.revertConfirm")}
              busyLabel={t("admin.running")}
              cancelLabel={t("admin.cancel")}
              busy={busy}
              onConfirm={() => run(() => apiClient.resetMetadataSettings())}
            />
          ) : null}
        </div>
        {message ? (
          <p className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The Apple Music API's MusicKit key (issue #87): with it, Apple Music is
 * searched through the API (with ISRCs and writers) rather than iTunes
 * Search. The private key is never shown back, only whether one is saved.
 */
function AppleMusicKeyCard() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MetadataSettings | null>(null);
  const [teamId, setTeamId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const apply = (next: MetadataSettings) => {
    setSettings(next);
    setTeamId(next.appleMusic.source === "env" ? "" : (next.appleMusic.teamId ?? ""));
    setKeyId(next.appleMusic.source === "env" ? "" : (next.appleMusic.keyId ?? ""));
    setPrivateKey("");
    setTokenUrl(next.appleMusic.tokenUrlSource === "database" ? (next.appleMusic.tokenUrl ?? "") : "");
  };
  useEffect(() => {
    apiClient.getMetadataSettings().then(apply).catch(() => {});
  }, []);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ kind: "ok", text: await action() });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const apple = settings?.appleMusic;
  const currently = apple?.source === "database" ? "keyDatabase" : apple?.source === "env" ? "keyEnv" : apple?.source === "tokenUrl" ? "keyTokenUrl" : "keyNone";
  return (
    <Card data-testid="apple-music-key">
      <CardHeader>
        <CardTitle className="text-sm">{t("metadataProviders.keyTitle")}</CardTitle>
        <CardDescription>{t("metadataProviders.keyDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {apple ? (
          <p className="text-sm text-muted-foreground">
            {t(`metadataProviders.${currently}`, { teamId: apple.teamId ?? "", keyId: apple.keyId ?? "", url: apple.tokenUrl ?? "" })}
          </p>
        ) : null}
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-team-id">{t("metadataProviders.teamId")}</Label>
            <Input id="apple-team-id" value={teamId} maxLength={10} autoComplete="off" onChange={(event) => setTeamId(event.target.value.toUpperCase())} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apple-key-id">{t("metadataProviders.keyId")}</Label>
            <Input id="apple-key-id" value={keyId} maxLength={10} autoComplete="off" onChange={(event) => setKeyId(event.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="flex max-w-xl flex-col gap-1.5">
          <Label htmlFor="apple-private-key">{t("metadataProviders.privateKey")}</Label>
          <Textarea
            id="apple-private-key"
            value={privateKey}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-xs"
            placeholder={apple?.hasDatabasePrivateKey ? t("metadataProviders.privateKeyKeep") : "-----BEGIN PRIVATE KEY-----"}
            onChange={(event) => setPrivateKey(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("metadataProviders.privateKeyHint")}</p>
        </div>
        <div className="flex max-w-xl flex-col gap-1.5 border-t pt-4">
          <Label htmlFor="apple-token-url">{t("metadataProviders.tokenUrl")}</Label>
          <Input
            id="apple-token-url"
            type="url"
            value={tokenUrl}
            autoComplete="off"
            placeholder={apple?.tokenUrlSource === "env" ? (apple.tokenUrl ?? "") : "https://"}
            onChange={(event) => setTokenUrl(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("metadataProviders.tokenUrlHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                apply(await apiClient.saveAppleMusicKey({ teamId, keyId, tokenUrl, ...(privateKey.trim() && { privateKey }) }));
                return t("metadataProviders.saved");
              })
            }
          >
            {t("metadataProviders.save")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || apple?.source === "none"}
            onClick={() =>
              void run(async () => {
                const result = await apiClient.testAppleMusicKey();
                if (!result.ok) throw new Error(result.message);
                return result.message;
              })
            }
          >
            {t("metadataProviders.test")}
          </Button>
          {apple && (apple.hasDatabasePrivateKey || apple.teamId || apple.keyId || apple.tokenUrlSource === "database") && apple.source !== "env" ? (
            <ConfirmButton
              label={t("metadataProviders.revert")}
              confirmLabel={t("metadataProviders.revertConfirm")}
              busyLabel={t("admin.running")}
              cancelLabel={t("admin.cancel")}
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  apply(await apiClient.resetAppleMusicKey());
                  return t("metadataProviders.saved");
                })
              }
            />
          ) : null}
        </div>
        {message ? (
          <p className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
