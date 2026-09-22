import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

export const Route = createFileRoute("/_protected/songbooks/new")({
  component: NewSongbook,
});

type Ownership = "personal" | "global" | `team:${string}`;

function NewSongbook() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, teams } = Route.useRouteContext();

  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [language, setLanguage] = useState("");
  const [publisher, setPublisher] = useState("");
  const [year, setYear] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("personal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const songbook = await apiClient.createSongbook({
        name,
        abbreviation: abbreviation.trim() || undefined,
        language: language.trim() || undefined,
        publisher: publisher.trim() || undefined,
        year: year.trim() ? Number(year) : undefined,
        teamId: ownership.startsWith("team:") ? ownership.slice(5) : undefined,
        global: ownership === "global",
      });
      await navigate({ to: "/songbooks/$songbookId", params: { songbookId: songbook.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("songbooks.createSongbook")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("songbooks.details")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-name">{t("songbooks.name")}</Label>
            <Input id="songbook-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Louange et Réveil" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-abbreviation">{t("songbooks.abbreviation")}</Label>
            <Input
              id="songbook-abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              placeholder="L&R"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-language">{t("songbooks.language")}</Label>
            <Input id="songbook-language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="fr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-publisher">{t("songbooks.publisher")}</Label>
            <Input id="songbook-publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="songbook-year">{t("songbooks.year")}</Label>
            <Input id="songbook-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("songbooks.ownership")}</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            id="songbook-ownership"
            value={ownership}
            onChange={(e) => setOwnership(e.target.value as Ownership)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="personal">{t("songbooks.personal")}</option>
            {teams.map((team) => (
              <option key={team.id} value={`team:${team.id}`}>
                {team.name}
              </option>
            ))}
            {session.isGlobalAdmin ? <option value="global">{t("songbooks.global")}</option> : null}
          </select>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={() => void submit()} disabled={submitting || !name.trim()}>
        {submitting ? t("songbooks.creating") : t("songbooks.createSongbook")}
      </Button>
    </div>
  );
}
