import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "#/lib/api-client";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";

export const Route = createFileRoute("/_protected/songbook-catalogs/$catalogId")({
  loader: async ({ context, params }) => {
    const catalog = await apiClient.getSongbookCatalog(params.catalogId).catch(() => null);
    if (!catalog) throw redirect({ to: "/songbook-catalogs" });
    return { session: context.session, catalog };
  },
  component: SongbookCatalogDetail,
});

function SongbookCatalogDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, catalog } = Route.useLoaderData();
  const canEdit = session.isGlobalAdmin;

  const [name, setName] = useState(catalog.name);
  const [abbreviation, setAbbreviation] = useState(catalog.abbreviation ?? "");
  const [publisher, setPublisher] = useState(catalog.publisher ?? "");
  const [isbn, setIsbn] = useState(catalog.isbn ?? "");
  const [description, setDescription] = useState(catalog.description ?? "");
  const [officialUrl, setOfficialUrl] = useState(catalog.officialUrl ?? "");
  const [language, setLanguage] = useState(catalog.language ?? "");
  const [denomination, setDenomination] = useState(catalog.denomination ?? "");
  const [totalEntries, setTotalEntries] = useState(catalog.totalEntries?.toString() ?? "");
  const [licensed, setLicensed] = useState(catalog.licensed);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [entryCode, setEntryCode] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const [csv, setCsv] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(
    null,
  );

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.updateSongbookCatalog(catalog.id, {
        name,
        abbreviation: abbreviation.trim() || undefined,
        publisher: publisher.trim() || undefined,
        isbn: isbn.trim() || undefined,
        description: description.trim() || undefined,
        officialUrl: officialUrl.trim() || undefined,
        language: language.trim() || undefined,
        denomination: denomination.trim() || undefined,
        totalEntries: totalEntries.trim() ? Number(totalEntries) : undefined,
        licensed,
      });
      await router.invalidate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await apiClient.deleteSongbookCatalog(catalog.id);
      window.location.href = "/songbook-catalogs";
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function addEntry() {
    if (!entryCode.trim() || !entryTitle.trim()) return;
    setAddingEntry(true);
    setEntryError(null);
    try {
      await apiClient.addSongbookCatalogEntry(catalog.id, { entryCode: entryCode.trim(), title: entryTitle.trim() });
      setEntryCode("");
      setEntryTitle("");
      await router.invalidate();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingEntry(false);
    }
  }

  async function removeEntry(entryId: string) {
    try {
      await apiClient.removeSongbookCatalogEntry(catalog.id, entryId);
      await router.invalidate();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runImport() {
    if (!csv.trim()) return;
    setImporting(true);
    setImportResult(null);
    setEntryError(null);
    try {
      const result = await apiClient.importSongbookCatalogCsv(catalog.id, csv);
      setImportResult(result);
      setCsv("");
      await router.invalidate();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{catalog.name}</h1>
        {catalog.description ? <p className="text-sm text-muted-foreground">{catalog.description}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("songbookCatalog.details")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-name">{t("songbookCatalog.name")}</Label>
            <Input id="catalog-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-abbreviation">{t("songbookCatalog.abbreviation")}</Label>
            <Input
              id="catalog-abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-publisher">{t("songbookCatalog.publisher")}</Label>
            <Input
              id="catalog-publisher"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-isbn">{t("songbookCatalog.isbn")}</Label>
            <Input id="catalog-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-description">{t("songbookCatalog.descriptionLabel")}</Label>
            <Textarea
              id="catalog-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-official-url">{t("songbookCatalog.officialUrl")}</Label>
            <Input
              id="catalog-official-url"
              value={officialUrl}
              onChange={(e) => setOfficialUrl(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-language">{t("songbookCatalog.language")}</Label>
            <Input
              id="catalog-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-denomination">{t("songbookCatalog.denomination")}</Label>
            <Input
              id="catalog-denomination"
              value={denomination}
              onChange={(e) => setDenomination(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="catalog-total-entries">{t("songbookCatalog.totalEntries")}</Label>
            <Input
              id="catalog-total-entries"
              type="number"
              value={totalEntries}
              onChange={(e) => setTotalEntries(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          {canEdit ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} />
              {t("songbookCatalog.licensed")}
            </label>
          ) : catalog.licensed ? (
            <p className="text-sm font-medium text-primary">{t("songbookCatalog.licensed")}</p>
          ) : null}

          {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
          {canEdit ? (
            <div className="flex items-center justify-between">
              <Button onClick={() => void save()} disabled={saving || !name.trim()}>
                {saving ? t("songbookCatalog.saving") : t("songbookCatalog.save")}
              </Button>
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={deleting}>
                    {deleting ? t("songbookCatalog.deleting") : t("songbookCatalog.confirmDelete")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    {t("songbookCatalog.cancel")}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
                  {t("songbookCatalog.deleteCatalog")}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("songbookCatalog.entries")} ({catalog.entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {catalog.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("songbookCatalog.noEntriesYet")}</p>
          ) : (
            <ul className="flex max-h-96 flex-col divide-y overflow-auto">
              {catalog.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 rounded-md bg-muted px-2 py-1 text-center text-xs font-medium">
                      {entry.entryCode}
                    </span>
                    <span className="text-sm">{entry.title}</span>
                  </div>
                  {canEdit ? (
                    <Button variant="ghost" size="sm" onClick={() => void removeEntry(entry.id)}>
                      {t("songbookCatalog.remove")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <>
              <div className="flex flex-col gap-2 border-t pt-4">
                <Label>{t("songbookCatalog.addEntry")}</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={entryCode}
                    onChange={(e) => setEntryCode(e.target.value)}
                    placeholder={t("songbookCatalog.entryCodePlaceholder")}
                    className="w-28"
                  />
                  <Input
                    value={entryTitle}
                    onChange={(e) => setEntryTitle(e.target.value)}
                    placeholder={t("songbookCatalog.entryTitlePlaceholder")}
                    className="max-w-xs"
                  />
                  <Button onClick={() => void addEntry()} disabled={addingEntry || !entryCode.trim() || !entryTitle.trim()}>
                    {addingEntry ? t("songbookCatalog.adding") : t("songbookCatalog.add")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t pt-4">
                <Label htmlFor="catalog-csv">{t("songbookCatalog.importCsv")}</Label>
                <p className="text-xs text-muted-foreground">{t("songbookCatalog.importCsvDescription")}</p>
                <Textarea
                  id="catalog-csv"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={6}
                  placeholder="entryCode,title,originalLanguage,composer,author,ccli"
                  className="font-mono text-xs"
                />
                <Button onClick={() => void runImport()} disabled={importing || !csv.trim()} className="self-start">
                  {importing ? t("songbookCatalog.importing") : t("songbookCatalog.runImport")}
                </Button>
                {importResult ? (
                  <div className="text-sm">
                    <p>
                      {t("songbookCatalog.importResult", {
                        created: importResult.created,
                        updated: importResult.updated,
                      })}
                    </p>
                    {importResult.errors.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-xs text-destructive">
                        {importResult.errors.map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {entryError ? <p className="text-sm text-destructive">{entryError}</p> : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
