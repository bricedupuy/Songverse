import type { SongVersionLink } from "@songverse/core";
import { useState } from "react";
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
  const [value, setValue] = useState(current?.sourceUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
    } catch {
      setError("Couldn't save that link.");
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
      setError("Couldn't remove that link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste a link" />
        </div>
        <Button size="sm" onClick={() => void save()} disabled={busy || !value.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {current ? (
          <Button variant="outline" size="sm" onClick={() => void remove()} disabled={busy}>
            Clear
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
