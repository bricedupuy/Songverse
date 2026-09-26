import type { ArtworkCandidate, SongVersionDetail } from "@songverse/core";
import { useRouter } from "@tanstack/react-router";
import { ImageIcon, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SongCover } from "#/components/library-home";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { apiClient } from "#/lib/api-client";

/**
 * A song's image (issue #85): the album or single's artwork from Apple
 * Music, kept on Songverse's storage. Found on its own for a new song; its
 * editors find another among Apple Music's matches, or remove it.
 */
export function ArtworkCard({ version, canEdit }: { version: SongVersionDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ArtworkCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
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

  function find() {
    setOpen(true);
    setCandidates(null);
    setError(null);
    apiClient
      .getArtworkCandidates(version.id)
      .then(setCandidates)
      .catch((err: unknown) => {
        setCandidates([]);
        setError(err instanceof Error ? err.message : String(err));
      });
  }

  return (
    <Card data-testid="artwork-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" aria-hidden />
          {t("artwork.title")}
        </CardTitle>
        <CardDescription>{t("artwork.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-4">
        <div className="w-32 shrink-0">
          <SongCover song={version} size="large" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!version.imageUrl ? <p className="text-sm text-muted-foreground">{t("artwork.none")}</p> : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={find} disabled={busy}>
                <Search />
                {t("artwork.find")}
              </Button>
              {version.imageUrl ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => apiClient.clearArtwork(version.id))}>
                  <Trash2 />
                  {t("artwork.remove")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {error && !open ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("artwork.chooseTitle")}</DialogTitle>
            <DialogDescription>{t("artwork.chooseDescription")}</DialogDescription>
          </DialogHeader>
          {candidates === null ? (
            <p className="text-sm text-muted-foreground">{t("artwork.searching")}</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{error ?? t("artwork.noMatches")}</p>
          ) : (
            <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3" data-testid="artwork-candidates">
              {candidates.map((candidate) => (
                <li key={candidate.artworkUrl}>
                  <button
                    type="button"
                    disabled={busy}
                    className="flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left hover:bg-accent disabled:opacity-60"
                    aria-label={t("artwork.use", { album: candidate.album ?? candidate.title })}
                    onClick={() =>
                      void run(() => apiClient.setArtwork(version.id, candidate.artworkUrl)).then((done) => {
                        if (done) setOpen(false);
                      })
                    }
                  >
                    <img src={candidate.thumbnailUrl} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                    <span className="truncate text-sm font-medium">{candidate.album ?? candidate.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {candidate.title} · {candidate.artist}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && candidates && candidates.length > 0 ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
