import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import type { AdminCommandResult, ArtworkSettings } from "@songverse/core";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { ConfirmButton } from "#/components/confirm-button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

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
