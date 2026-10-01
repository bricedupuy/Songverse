import { formatScreenCode, normalizeScreenCode, SCREEN_MODES, type ScreenMode, type ScreenSummary, type SetlistSummary } from "@songverse/core";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MonitorCheck, MonitorUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "#/components/confirm-button";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect } from "#/components/ui/native-select";
import { apiClient } from "#/lib/api-client";
import { setlistTitle } from "#/lib/setlists";

export interface ScreensSearch {
  /** The code a screen shows, from its QR code. */
  code?: string;
  /** The set to show, from its Live view. */
  setlistId?: string;
}

export const Route = createFileRoute("/_protected/screens")({
  validateSearch: (search: Record<string, unknown>): ScreensSearch => ({
    ...(typeof search.code === "string" ? { code: search.code } : {}),
    ...(typeof search.setlistId === "string" ? { setlistId: search.setlistId } : {}),
  }),
  loaderDeps: ({ search }) => ({ setlistId: search.setlistId }),
  loader: async ({ deps }) => {
    const [sets, screens] = await Promise.all([apiClient.listSetlists(), apiClient.listScreens(deps.setlistId).catch(() => apiClient.listScreens())]);
    // Only a set they lead can be shown: its sync session is theirs to lead.
    return { sets: sets.filter((set) => set.canEdit), screens };
  },
  component: ScreensPage,
});

/**
 * Screens (issue #186): a big screen paired by the code it shows - typed,
 * or scanned from its QR code, which opens this page with it - and the
 * screens showing a set, to rename, change what they show, or disconnect.
 */
function ScreensPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const search = Route.useSearch();
  const { sets, screens } = Route.useLoaderData();
  const [paired, setPaired] = useState<ScreenSummary | null>(null);
  const setName = (id: string | null) => {
    const set = sets.find((one) => one.id === id);
    return set ? setlistTitle(set, t, i18n.language) : t("screens.noSet");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("screens.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("screens.description")}</p>
      </div>

      {paired ? (
        <Card data-testid="screen-paired">
          <CardContent className="flex items-center gap-3">
            <MonitorCheck className="size-6 shrink-0 text-primary" />
            <p className="text-sm">{t("screens.paired", { name: paired.name, set: setName(paired.setlistId) })}</p>
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setPaired(null)}>
              {t("screens.pairAnother")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PairForm
          sets={sets}
          code={search.code ?? ""}
          setlistId={search.setlistId}
          onPaired={async (screen) => {
            setPaired(screen);
            await router.invalidate();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{search.setlistId ? t("screens.ofSet", { set: setName(search.setlistId) }) : t("screens.yours")}</CardTitle>
        </CardHeader>
        <CardContent>
          {screens.length === 0 ? <p className="text-sm text-muted-foreground">{t("screens.none")}</p> : null}
          <ul className="flex flex-col divide-y" data-testid="screens-list">
            {screens.map((screen) => (
              <ScreenRow key={screen.id} screen={screen} sets={sets} onChanged={() => router.invalidate()} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ModeSelect({ id, value, onChange }: { id: string; value: ScreenMode; onChange: (mode: ScreenMode) => void }) {
  const { t } = useTranslation();
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value as ScreenMode)}>
      {SCREEN_MODES.map((mode) => (
        <option key={mode} value={mode}>
          {t(`screens.modes.${mode}`)}
        </option>
      ))}
    </NativeSelect>
  );
}

function SetSelect({ id, sets, value, onChange, allowNone = false }: { id: string; sets: SetlistSummary[]; value: string; onChange: (id: string) => void; allowNone?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      {allowNone || !value ? <option value="">{t("screens.noSet")}</option> : null}
      {sets.map((set) => (
        <option key={set.id} value={set.id}>
          {setlistTitle(set, t, i18n.language)}
        </option>
      ))}
    </NativeSelect>
  );
}

/** The code the screen shows, the set it's to show and how: confirmed, the screen shows it at once. */
function PairForm({ sets, code: initialCode, setlistId, onPaired }: { sets: SetlistSummary[]; code: string; setlistId?: string; onPaired: (screen: ScreenSummary) => Promise<void> }) {
  const { t } = useTranslation();
  const [code, setCode] = useState(initialCode ? formatScreenCode(normalizeScreenCode(initialCode) ?? initialCode) : "");
  const [set, setSet] = useState(setlistId && sets.some((one) => one.id === setlistId) ? setlistId : (sets[0]?.id ?? ""));
  const [mode, setMode] = useState<ScreenMode>("LYRICS");
  const [name, setName] = useState(t("screens.defaultName"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeScreenCode(code);
    if (!normalized) return setError(t("screens.badCode"));
    setPending(true);
    setError(null);
    try {
      await onPaired(await apiClient.confirmScreenPairing(normalized, { name: name.trim() || t("screens.defaultName"), mode, setlistId: set }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorUp className="size-5" />
          {t("screens.pairTitle")}
        </CardTitle>
        <CardDescription>{t("screens.pairDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("screens.noSets")}</p>
        ) : (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} data-testid="screen-pair-form">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="screen-code">{t("screens.code")}</Label>
              <Input
                id="screen-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="K7Q-M3X"
                autoComplete="off"
                autoCapitalize="characters"
                className="font-mono text-lg tracking-widest"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="screen-name">{t("screens.name")}</Label>
              <Input id="screen-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="screen-set">{t("screens.set")}</Label>
              <SetSelect id="screen-set" sets={sets} value={set} onChange={setSet} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="screen-mode">{t("screens.mode")}</Label>
              <ModeSelect id="screen-mode" value={mode} onChange={setMode} />
            </div>
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending || !set}>
                {pending ? t("screens.pairing") : t("screens.pair")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** A screen: its name, the set it shows and how, changed as they're picked; or disconnected. */
function ScreenRow({ screen, sets, onChanged }: { screen: ScreenSummary; sets: SetlistSummary[]; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(screen.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const known = !screen.setlistId || sets.some((set) => set.id === screen.setlistId);

  async function change(data: Parameters<typeof apiClient.updateScreen>[1]) {
    setError(null);
    try {
      await apiClient.updateScreen(screen.id, data);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0" data-testid={`screen-${screen.name}`}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`screen-name-${screen.id}`}>{t("screens.name")}</Label>
          <Input
            id={`screen-name-${screen.id}`}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => name.trim() && name.trim() !== screen.name && void change({ name: name.trim() })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`screen-set-${screen.id}`}>{t("screens.set")}</Label>
          {known ? (
            <SetSelect id={`screen-set-${screen.id}`} sets={sets} value={screen.setlistId ?? ""} allowNone onChange={(id) => void change({ setlistId: id || null })} />
          ) : (
            <p className="text-sm">{screen.setlist ? setlistTitle(screen.setlist, t, i18n.language) : t("screens.noSet")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`screen-mode-${screen.id}`}>{t("screens.mode")}</Label>
          <ModeSelect id={`screen-mode-${screen.id}`} value={screen.mode} onChange={(mode) => void change({ mode })} />
        </div>
        <ConfirmButton
          label={t("screens.disconnect")}
          confirmLabel={t("screens.confirmDisconnect")}
          busyLabel={t("screens.disconnecting")}
          cancelLabel={t("admin.cancel")}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await apiClient.deleteScreen(screen.id);
              await onChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {screen.lastSeenAt ? <p className="text-xs text-muted-foreground">{t("screens.lastSeen", { when: new Date(screen.lastSeenAt).toLocaleString(i18n.language) })}</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
