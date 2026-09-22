import type { MusicBrainzRecordingMatch } from "@songverse/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "#/lib/api-client";
import { LanguageSelect } from "#/components/language-select";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/library/new")({
  component: NewSong,
});

function NewSong() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("en");
  const [artist, setArtist] = useState("");
  const [matches, setMatches] = useState<MusicBrainzRecordingMatch[] | null>(null);
  const [selected, setSelected] = useState<MusicBrainzRecordingMatch | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      setMatches(await apiClient.searchMusicBrainzRecordings(title, artist || undefined));
    } catch {
      setError("MusicBrainz search failed. Try again in a moment.");
    } finally {
      setSearching(false);
    }
  }

  function pick(match: MusicBrainzRecordingMatch) {
    setSelected(match);
    setMatches(null);
    if (!title.trim()) setTitle(match.title);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const version = await apiClient.createSongVersion({ title, language });
      if (selected) {
        await apiClient.linkSongVersionMusicBrainz(version.id, selected.mbid);
      } else if (artist.trim()) {
        await apiClient.addContributor(version.id, artist.trim(), ["performer"]);
      }
      await navigate({ to: "/library/$songVersionId", params: { songVersionId: version.id } });
    } catch {
      setError("Couldn't create this song. Check the fields and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Add a song</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Amazing Grace" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">Language</Label>
            <LanguageSelect id="language" value={language} onChange={setLanguage} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Match with MusicBrainz (optional)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {selected ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">{selected.title}</p>
                <p className="text-muted-foreground">
                  {selected.artist ?? "Unknown artist"}
                  {selected.releaseTitle ? ` · ${selected.releaseTitle}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist (optional)" className="max-w-xs" />
                <Button type="button" variant="outline" onClick={() => void search()} disabled={searching || !title.trim()}>
                  {searching ? "Searching…" : "Search"}
                </Button>
              </div>
              {matches ? (
                matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches found — you can still create the song without one.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {matches.map((match) => (
                      <li key={match.mbid} className="flex items-center justify-between gap-4 rounded-md border p-3">
                        <div className="text-sm">
                          <p className="font-medium">{match.title}</p>
                          <p className="text-muted-foreground">
                            {match.artist ?? "Unknown artist"}
                            {match.releaseTitle ? ` · ${match.releaseTitle}` : ""}
                            {match.releaseDate ? ` · ${match.releaseDate.slice(0, 4)}` : ""}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => pick(match)}>
                          Use this
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={() => void submit()} disabled={submitting || !title.trim() || !language.trim()}>
        {submitting ? "Creating…" : "Create song"}
      </Button>
    </div>
  );
}
