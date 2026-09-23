import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Trash2 } from "lucide-react";
import { authClient } from "#/lib/auth-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/account")({
  component: AccountSettings,
});

function AccountSettings() {
  const { t } = useTranslation();
  const { session } = Route.useRouteContext();
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
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("account.title")}</h1>
        <p className="text-sm text-muted-foreground">{session.email}</p>
      </div>

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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removePasskey(passkey.id)}
                    disabled={removingId === passkey.id}
                  >
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
    </div>
  );
}
