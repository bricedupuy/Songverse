import { SUPPORTED_LOCALES, type LocaleValue, type StorageUsage, type UserProfile } from "@songverse/core";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Trash2 } from "lucide-react";
import { apiClient } from "#/lib/api-client";
import { authClient } from "#/lib/auth-client";
import { formatBytes } from "#/lib/format-bytes";
import { AvatarCropDialog } from "#/components/avatar-crop-dialog";
import { sizedAvatarUrl } from "#/lib/avatar-url";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { initials } from "#/lib/initials";
import { NativeSelect } from "#/components/ui/native-select";

// Only guards what the browser has to decode for cropping; what's uploaded
// is the cropped result, at most 512x512.
const MAX_AVATAR_SOURCE_BYTES = 25 * 1024 * 1024;

const LOCALE_NAMES: Record<LocaleValue, string> = { en: "English", fr: "Français" };

export function ProfileCard({ profile }: { profile: UserProfile }) {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);

  async function run(action: () => Promise<unknown>, successText?: string) {
    setPending(true);
    setMessage(null);
    try {
      await action();
      // Also reloads the session, so the sidebar picks up the new name/picture.
      await router.invalidate();
      if (successText) setMessage({ kind: "ok", text: successText });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPending(false);
    }
  }

  function onFileChosen(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setMessage({ kind: "error", text: t("account.avatarTooLarge") });
      return;
    }
    setMessage(null);
    setCropping(file);
  }

  const trimmedName = displayName.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("account.profile")}</CardTitle>
        <CardDescription>{t("account.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {profile.avatarUrl ? <AvatarImage src={sizedAvatarUrl(profile.avatarUrl, 64)} alt="" /> : null}
            <AvatarFallback className="text-lg">{initials(profile.displayName)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={pending} onClick={() => fileInput.current?.click()}>
                {t("account.uploadAvatar")}
              </Button>
              {profile.avatarUrl ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => void run(() => apiClient.removeAvatar())}>
                  {t("account.removeAvatar")}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("account.avatarHint")}</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="avatar-input"
              onChange={(event) => {
                onFileChosen(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => apiClient.updateMe({ displayName: trimmedName }), t("account.saved"));
          }}
        >
          <Label htmlFor="display-name">{t("account.displayNameLabel")}</Label>
          <div className="flex gap-2">
            <Input id="display-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
            <Button type="submit" disabled={pending || trimmedName === "" || trimmedName === profile.displayName}>
              {pending ? t("account.saving") : t("account.save")}
            </Button>
          </div>
        </form>

        {message ? (
          <p className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>
        ) : null}

        {cropping ? (
          <AvatarCropDialog
            file={cropping}
            onCancel={() => setCropping(null)}
            onConfirm={async (cropped) => {
              await apiClient.uploadAvatar(cropped, "avatar.webp");
              setCropping(null);
              // Also reloads the session, so the sidebar picks up the new picture.
              await router.invalidate();
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EmailCard({ email }: { email: string }) {
  const { t } = useTranslation();
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeEmail() {
    setPending(true);
    setError(null);
    const result = await authClient.changeEmail({
      newEmail: newEmail.trim(),
      // BetterAuth resolves a relative URL against the API's origin, not this app's.
      callbackURL: `${window.location.origin}/dashboard`,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? String(result.error.status));
      return;
    }
    setSent(true);
    setNewEmail("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("account.emailTitle")}</CardTitle>
        <CardDescription>{t("account.emailDescription", { email })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void changeEmail();
          }}
        >
          <Label htmlFor="new-email">{t("account.newEmailLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="new-email"
              type="email"
              required
              value={newEmail}
              autoComplete="email"
              onChange={(event) => setNewEmail(event.target.value)}
            />
            <Button type="submit" disabled={pending || newEmail.trim() === ""}>
              {t("account.changeEmail")}
            </Button>
          </div>
        </form>
        {sent ? <p className="text-sm text-muted-foreground">{t("account.changeEmailSent", { email })}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function StorageCard({ storage }: { storage: StorageUsage }) {
  const { t } = useTranslation();
  const used = formatBytes(storage.usedBytes);
  const percent = storage.limitBytes ? Math.min(100, (storage.usedBytes / storage.limitBytes) * 100) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("account.storageTitle")}</CardTitle>
        <CardDescription>{t("account.storageDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {storage.limitBytes === null ? (
          <p className="text-sm">{t("account.storageUnlimited", { used })}</p>
        ) : (
          <>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
            >
              <div className={percent >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm">{t("account.storageUsage", { used, limit: formatBytes(storage.limitBytes) })}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function PasskeysCard() {
  const { t } = useTranslation();
  const { data: passkeys, isPending } = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addPasskey() {
    setError(null);
    setAdding(true);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setAdding(false);
    if (result?.error) {
      setError(result.error.message ?? t("account.passkeyAddFailed"));
      return;
    }
    setName("");
  }

  async function removePasskey(id: string) {
    setError(null);
    setRemovingId(id);
    const result = await authClient.passkey.deletePasskey({ id });
    setRemovingId(null);
    if (result?.error) {
      setError(result.error.message ?? t("account.passkeyRemoveFailed"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("account.passkeys")}</CardTitle>
        <CardDescription>{t("account.passkeysDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : passkeys && passkeys.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{passkey.name || t("account.unnamedPasskey")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("account.addedOn", { date: new Date(passkey.createdAt).toLocaleDateString() })}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void removePasskey(passkey.id)} disabled={removingId === passkey.id}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("account.noPasskeysYet")}</p>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="passkey-name">{t("account.passkeyNameLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="passkey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("account.passkeyNamePlaceholder")}
            />
            <Button onClick={() => void addPasskey()} disabled={adding}>
              {adding ? t("account.addingPasskey") : t("account.addPasskey")}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function LanguageCard({ locale }: { locale: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeLocale(next: LocaleValue) {
    setSaving(true);
    try {
      await apiClient.updateMe({ locale: next });
      await router.invalidate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("dashboard.language")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <Label htmlFor="locale">{t("dashboard.languageDescription")}</Label>
        <NativeSelect
          id="locale"
          value={locale}
          disabled={saving}
          onChange={(e) => void changeLocale(e.target.value as LocaleValue)}
          className="w-full max-w-xs"
        >
          {SUPPORTED_LOCALES.map((option) => (
            <option key={option} value={option}>
              {LOCALE_NAMES[option]}
            </option>
          ))}
        </NativeSelect>
      </CardContent>
    </Card>
  );
}
