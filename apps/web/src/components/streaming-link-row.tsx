import type { SongVersionLink } from "@songverse/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export function StreamingLinkRow({
  id,
  label,
  current,
  onSave,
  onRemove,
}: {
  id: string;
  label: string;
  current: SongVersionLink | undefined;
  onSave: (url: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current?.sourceUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
    } catch {
      setError(t("songEditor.links.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onRemove();
      setValue("");
    } catch {
      setError(t("songEditor.links.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("songEditor.links.pastePlaceholder")} />
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !value.trim()}>
          {busy ? t("songEditor.saving") : t("songEditor.links.save")}
        </Button>
        {current ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void remove()} disabled={busy}>
            {t("songEditor.links.clear")}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
