import {
  ISO_639_1_CODES,
  getLanguageDisplayName,
  songToChordPro,
  type Attachment,
  type MusicBrainzRecordingMatch,
  type MusicBrainzWorkMatch,
  type SongDocumentV2,
  type SongMatch,
  type SongVersionDetail,
  type SongVersionSongbookMembership,
  type Tag,
} from "@songverse/core";
import { useBlocker, useNavigate, useRouter } from "@tanstack/react-router";
import { FileText, Info, Layers, Link2, MoreHorizontal, Music, PenLine } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OfflinePinButton } from "#/components/offline-pin-button";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { apiClient } from "#/lib/api-client";
import { attachmentTypeFor, isPdf } from "./attachment-types";
import { SongContentCard, type SourceFile } from "./song-content";
import {
  emptyForm,
  fillFrom,
  formFromVersion,
  isDirty,
  nameKeyChanges,
  toCreateInput,
  toUpdateInput,
  validate,
  withContent,
  withSections,
  type SongForm,
} from "./song-form";
import { AutoDetectCard, BasicInfoCard, LibraryMatchPanel, MoreDetailsCard, SongbooksCard } from "./song-info";
import { PublishCard } from "./publish-card";
import { ArrangementsTab } from "./arrangements-tab";
import { AttachmentsTab, LinksTab, SaveFirst } from "./song-tabs";
import type { SongNotice, SongTab } from "./song-tabs-list";

// The editor (Tiptap and ProseMirror) loads when the Editor tab first opens, not with the song page.
const StructuredEditor = lazy(() => import("./structured/structured-editor").then((module) => ({ default: module.StructuredEditor })));
import { downloadBlob } from "#/lib/download";
import { StemDock } from "#/components/stem-dock";
import { stemsOf } from "#/lib/stem-engine";
import { useMode } from "#/lib/mode";


type EditProps = {
  mode: "edit";
  version: SongVersionDetail;
  recordingMatch: MusicBrainzRecordingMatch | null;
  workMatch: MusicBrainzWorkMatch | null;
  attachments: Attachment[];
  songbookMemberships: SongVersionSongbookMembership[];
  notices?: SongNotice[];
};
type CreateProps = { mode: "create" };

type MatchVersion = SongMatch["versions"][number];

/** The version a new song is being added as another version of. */
type BasedOn = { id: string; label: string; copied: boolean };


/**
 * The song screen, for adding a song and for editing one: Song Info
 * (every field, the chart's text), Editor (the text beside a preview),
 * then Files, Audio and Links. Song Info and Editor are saved together by
 * "Save song"; files and links are saved as they're added.
 */
export function SongEditor(props: (CreateProps | EditProps) & { tags: Tag[]; tab: SongTab; onTabChange: (tab: SongTab) => void }) {
  const { tags, tab, onTabChange } = props;
  const edit = props.mode === "edit" ? props : null;
  const version = edit?.version ?? null;
  const canEdit = version ? version.canEdit : true;
  const { t, i18n } = useTranslation();
  const { mode } = useMode();
  const navigate = useNavigate();
  const router = useRouter();

  const defaultLanguage = (ISO_639_1_CODES as readonly string[]).includes(i18n.language) ? i18n.language : "en";
  // Reload from the song when it changes (a save, say) - not when anything
  // else reloads the page (an upload), which would drop unsaved edits.
  const versionKey = version
    ? JSON.stringify([version.updatedAt, version.contributors.map((c) => [c.id, c.roles]), version.tags.map((tag) => tag.id)])
    : "new";
  const loaded = useMemo(() => (version ? formFromVersion(version) : emptyForm(defaultLanguage)), [versionKey]);
  const [initial, setInitial] = useState(loaded);
  const [form, setForm] = useState(loaded);
  // The form as last loaded or saved. The reloaded song replaces the form
  // only if it hasn't been edited since: the reload lands a moment after a
  // save, and an edit made in between must survive it (#39).
  const baseline = useRef(loaded);
  useEffect(() => {
    const base = baseline.current;
    baseline.current = loaded;
    setInitial(loaded);
    setForm((current) => (isDirty(current, base) ? current : loaded));
  }, [loaded]);

  const [showErrors, setShowErrors] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mbChoice, setMbChoice] = useState<MusicBrainzRecordingMatch | null | undefined>(undefined);
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null);
  const [basedOn, setBasedOn] = useState<BasedOn | null>(null);
  const [matches, setMatches] = useState<SongMatch[]>([]);
  const [dismissedTitle, setDismissedTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const leaving = useRef(false);

  const errors = showErrors ? validate(form) : {};
  const dirty = isDirty(form, initial) || mbChoice !== undefined || sourceFile !== null || basedOn !== null;

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && !leaving.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirty && !leaving.current,
    withResolver: true,
  });

  function setField<K extends keyof SongForm>(field: K, value: SongForm[K]) {
    updateForm((current) => {
      const next = { ...current, [field]: value };
      // Key changes in the song's order are named from the song's key.
      return field === "key" ? { ...next, flow: nameKeyChanges(next.flow, next.key) } : next;
    });
  }

  function updateForm(change: (current: SongForm) => SongForm) {
    setForm(change);
    setMessage(null);
  }

  // Songs already in the library with this title (adding only).
  const title = form.title.trim();
  useEffect(() => {
    if (edit || basedOn || title.length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .findSongMatches(title)
        .then((found) => !cancelled && setMatches(found))
        .catch(() => !cancelled && setMatches([]));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [edit, basedOn, title]);
  const showMatches = matches.length > 0 && dismissedTitle !== title.toLowerCase();

  function chooseRecording(match: MusicBrainzRecordingMatch | null) {
    setMessage(null);
    if (match && edit?.recordingMatch?.mbid === match.mbid) {
      setMbChoice(undefined);
      return;
    }
    if (!match && !edit?.recordingMatch) {
      setMbChoice(undefined);
      return;
    }
    setMbChoice(match);
    if (!match) return;
    // Fill in what's still empty from what MusicBrainz knows.
    setForm((current) => ({
      ...current,
      title: current.title.trim() ? current.title : match.title,
      artists: current.artists.length === 0 && match.artist ? [match.artist] : current.artists,
      album: current.album.trim() ? current.album : (match.releaseTitle ?? ""),
      year: current.year.trim() ? current.year : (match.releaseDate?.slice(0, 4) ?? ""),
    }));
  }

  async function useAsBase(base: MatchVersion) {
    setBusy(true);
    setMessage(null);
    try {
      const detail = await apiClient.getSongVersion(base.id);
      setForm((current) => fillFrom(current, formFromVersion(detail)));
      setBasedOn({ id: base.id, label: base.versionName ? `${base.title} — ${base.versionName}` : base.title, copied: true });
      setDetailsOpen(true);
    } catch {
      setMessage({ kind: "error", text: t("songEditor.loadFailed") });
    } finally {
      setBusy(false);
    }
  }

  function newVersionOf(base: MatchVersion, versionName: string) {
    const next = {
      ...form,
      versionName,
      title: form.title.trim() || base.title,
      artists: form.artists.length > 0 ? form.artists : base.artists,
    };
    const target = { id: base.id, label: base.versionName ? `${base.title} — ${base.versionName}` : base.title, copied: false };
    setForm(next);
    setBasedOn(target);
    void save(next, target);
  }

  function exportChordPro() {
    // What's on screen, saved or not: the chart from the text, the details from the fields.
    const doc: SongDocumentV2 = {
      $schema: "song-document/v2",
      revision: 0,
      defaults: {
        key: form.key || null,
        tempo: form.tempo.trim() ? Number(form.tempo) : null,
        timeSignature: form.timeSignature
          ? { numerator: Number(form.timeSignature.split("/")[0]), denominator: Number(form.timeSignature.split("/")[1]) }
          : null,
      },
      sections: form.sections,
      flow: form.flow,
    };
    const file = songToChordPro(doc, {
      title: form.title.trim(),
      subtitle: form.alternateTitle.trim() || null,
      artists: form.artists,
      composers: form.composers,
      lyricists: form.lyricists,
      album: form.album.trim() || null,
      year: form.year.trim() ? Number(form.year) : null,
      copyright: form.copyright.trim() || null,
      ccli: form.ccli.trim() || null,
      capo: form.capo ? Number(form.capo) : null,
    });
    downloadBlob(new Blob([file], { type: "text/plain" }), `${form.title.trim() || "song"}.cho`);
  }

  async function keepSourceFile(songVersionId: string) {
    if (!sourceFile || !(sourceFile.keep || isPdf(sourceFile.file))) return;
    await apiClient.uploadAttachment(songVersionId, attachmentTypeFor(sourceFile.file), sourceFile.file);
  }

  async function save(current: SongForm = form, base: BasedOn | null = basedOn) {
    setShowErrors(true);
    const problems = validate(current);
    if (Object.keys(problems).length > 0) {
      if (Object.keys(problems).some((field) => field !== "title" && field !== "artists")) setDetailsOpen(true);
      onTabChange("info");
      setMessage({ kind: "error", text: t("songEditor.fixErrors") });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (!edit) {
        const created = await apiClient.createSongVersion({ ...toCreateInput(current), ...(base && { basedOnVersionId: base.id }) });
        const notices: SongNotice[] = [];
        if (mbChoice) await apiClient.linkSongVersionMusicBrainz(created.id, mbChoice.mbid).catch(() => notices.push("linkFailed"));
        await keepSourceFile(created.id).catch(() => notices.push("fileFailed"));
        leaving.current = true;
        await navigate({
          to: "/library/$songVersionId",
          params: { songVersionId: created.id },
          search: { tab: "info", ...(notices.length > 0 && { notice: notices.join(",") }) },
        });
        return;
      }
      const update = toUpdateInput(current, initial);
      // The revision this edit started from: refused if someone saved in the meantime.
      if (Object.keys(update).length > 0) {
        await apiClient.updateSongVersion(edit.version.id, { ...update, revision: edit.version.documentJson.revision });
      }
      // Saved: edits made from here on are new ones, kept when the song reloads.
      baseline.current = current;
      if (mbChoice) await apiClient.linkSongVersionMusicBrainz(edit.version.id, mbChoice.mbid);
      else if (mbChoice === null) await apiClient.unlinkSongVersionMusicBrainz(edit.version.id);
      setMbChoice(undefined);
      await keepSourceFile(edit.version.id);
      setSourceFile(null);
      setShowErrors(false);
      await router.invalidate();
      setMessage({ kind: "ok", text: t("songEditor.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error && err.message ? err.message : t("songEditor.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(initial);
    setMbChoice(undefined);
    setSourceFile(null);
    setShowErrors(false);
    setMessage(null);
  }

  async function remove() {
    if (!edit) return;
    setDeleting(true);
    try {
      await apiClient.deleteSongVersion(edit.version.id);
      leaving.current = true;
      await navigate({ to: "/library" });
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      setMessage({ kind: "error", text: err instanceof Error ? err.message : t("songEditor.deleteFailed") });
    }
  }

  const attachments = edit?.attachments ?? [];
  const stems = stemsOf(attachments);
  const audioCount = attachments.filter((a) => a.type === "AUDIO").length;
  const fileCount = attachments.length - audioCount;
  const shownRecording = mbChoice === undefined ? (edit?.recordingMatch ?? null) : mbChoice;

  const songInfo = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <fieldset disabled={!canEdit || saving} className="flex min-w-0 flex-col gap-6">
        {basedOn ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm" role="status">
            <span className="min-w-0 flex-1">
              {t(basedOn.copied ? "songEditor.basedOnCopied" : "songEditor.basedOn", { title: basedOn.label })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setBasedOn(null)}>
              {t("songEditor.undo")}
            </Button>
          </div>
        ) : null}
        <BasicInfoCard form={form} setField={setField} errors={errors} />
        {showMatches ? (
          <LibraryMatchPanel
            matches={matches}
            busy={busy || saving}
            onUseAsBase={(base) => void useAsBase(base)}
            onNewVersion={newVersionOf}
            onDismiss={() => setDismissedTitle(title.toLowerCase())}
          />
        ) : null}
        {canEdit ? (
          <AutoDetectCard
            title={form.title}
            artist={form.artists[0]}
            shown={shownRecording}
            staged={mbChoice !== undefined}
            onChoose={chooseRecording}
          />
        ) : null}
        <MoreDetailsCard form={form} setField={setField} errors={errors} tags={tags} open={detailsOpen} onOpenChange={setDetailsOpen} />
      </fieldset>
      <div className="flex min-w-0 flex-col gap-6">
        {canEdit ? (
          <fieldset disabled={saving} className="min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" aria-hidden />
                  {t("songEditor.songContent")}
                </CardTitle>
                <CardDescription>{t("songEditor.songContentDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SongContentCard
                  content={form.content}
                  format={form.contentFormat}
                  onContentChange={(content) => updateForm((current) => withContent(current, content, current.contentFormat))}
                  onFormatChange={(format) => updateForm((current) => withContent(current, current.content, format))}
                  sourceFile={sourceFile}
                  onSourceFile={setSourceFile}
                />
              </CardContent>
            </Card>
          </fieldset>
        ) : null}
        {edit ? <SongbooksCard memberships={edit.songbookMemberships} title={edit.version.title} /> : null}
        {edit && canEdit && edit.version.ownerScope !== "GLOBAL" ? <PublishCard songVersionId={edit.version.id} /> : null}
      </div>
    </div>
  );

  const heading = edit ? edit.version.title : t("songEditor.createTitle");
  const subheading = edit
    ? [edit.version.artists.map((a) => a.source).filter(Boolean).join(", "), getLanguageDisplayName(edit.version.language, i18n.language)]
        .filter(Boolean)
        .join(" · ")
    : t("songEditor.createDescription");

  return (
    <form
      className={`flex flex-col gap-6 ${canEdit && dirty ? "pb-16 md:pb-0" : ""}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit) void save();
      }}
    >
      {/* Sticky on wider screens; a phone gets the save bar at the bottom instead. */}
      <div className="z-30 -mt-4 flex flex-wrap md:sticky md:top-0 items-center justify-between gap-3 border-b bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            <span className="min-w-0 break-words">{heading}</span>
            {edit?.version.versionName ? (
              <span className="rounded-full border px-2.5 py-0.5 text-sm font-medium text-muted-foreground">{edit.version.versionName}</span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">{subheading}</p>
          {edit ? (
            <div className="mt-2">
              <OfflinePinButton kind="SONG" targetId={edit.version.id} />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <>
              {edit ? (
                <Button type="button" variant="outline" onClick={discard} disabled={!dirty || saving}>
                  {t("songEditor.discard")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void navigate({ to: "/library" })}>
                  {t("songEditor.cancel")}
                </Button>
              )}
              <Button type="submit" disabled={saving || (!!edit && !dirty)}>
                {saving ? t("songEditor.saving") : t("songEditor.save")}
              </Button>
            </>
          ) : null}
          {edit ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("songEditor.moreActions")}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportChordPro}>{t("songEditor.exportChordPro")}</DropdownMenuItem>
                {canEdit ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmingDelete(true)}>
                      {t("songEditor.deleteSong")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {message ? (
          <p
            className={`basis-full text-sm ${message.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>

      {edit?.notices?.length ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {edit.notices.map((notice) => t(`songEditor.notices.${notice}`)).join(" ")}
        </p>
      ) : null}
      {version && !canEdit ? <p className="text-sm text-muted-foreground">{t("songEditor.readOnly")}</p> : null}

      {/* Practice: the song's stems, docked at the bottom (issue #64). */}
      {edit && mode === "practice" && stems.length > 0 ? (
        <StemDock
          song={{
            songVersionId: edit.version.id,
            title: edit.version.title,
            returnTo: `/library/${edit.version.id}`,
            stems,
            load: (file) => apiClient.downloadAttachment(edit.version.id, file.id),
          }}
        />
      ) : null}

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as SongTab)} className="gap-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="info" className="flex-none px-3">
            <Info aria-hidden />
            {t("songEditor.tabs.info")}
          </TabsTrigger>
          <TabsTrigger value="editor" className="flex-none px-3">
            <PenLine aria-hidden />
            {t("songEditor.tabs.editor")}
          </TabsTrigger>
          <TabsTrigger value="arrangements" className="flex-none px-3">
            <Layers aria-hidden />
            {t("songEditor.tabs.arrangements")}
          </TabsTrigger>
          <TabsTrigger value="files" className="flex-none px-3">
            <FileText aria-hidden />
            {t("songEditor.tabs.files")}
            {fileCount > 0 ? <span className="rounded-full bg-muted px-1.5 text-xs">{fileCount}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="audio" className="flex-none px-3">
            <Music aria-hidden />
            {t("songEditor.tabs.audio")}
            {audioCount > 0 ? <span className="rounded-full bg-muted px-1.5 text-xs">{audioCount}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="links" className="flex-none px-3">
            <Link2 aria-hidden />
            {t("songEditor.tabs.links")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="info">{songInfo}</TabsContent>
        <TabsContent value="editor">
          <fieldset disabled={saving} className="min-w-0">
            <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">{t("songEditor.loadingEditor")}</p>}>
              <StructuredEditor
                sections={form.sections}
                onChange={(sections) => updateForm((current) => withSections(current, sections))}
                flow={form.flow}
                onFlowChange={(flow) => updateForm((current) => ({ ...current, flow: nameKeyChanges(flow, current.key) }))}
                songKey={form.key}
                onSongKeyChange={(key) => setField("key", key)}
                readOnly={!canEdit}
              />
            </Suspense>
          </fieldset>
        </TabsContent>
        <TabsContent value="arrangements">{edit ? <ArrangementsTab songVersionId={edit.version.id} /> : <SaveFirst />}</TabsContent>
        <TabsContent value="files">
          {edit ? <AttachmentsTab kind="files" songVersionId={edit.version.id} attachments={attachments} canEdit={canEdit} /> : <SaveFirst />}
        </TabsContent>
        <TabsContent value="audio">
          {edit ? <AttachmentsTab kind="audio" songVersionId={edit.version.id} attachments={attachments} canEdit={canEdit} /> : <SaveFirst />}
        </TabsContent>
        <TabsContent value="links">{edit ? <LinksTab version={edit.version} workMatch={edit.workMatch} /> : <SaveFirst />}</TabsContent>
      </Tabs>

      {canEdit && dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t bg-background px-4 py-3 md:hidden" data-testid="mobile-save-bar">
          <span className="text-sm text-muted-foreground">{t("songEditor.unsaved")}</span>
          <Button type="submit" disabled={saving}>
            {saving ? t("songEditor.saving") : t("songEditor.save")}
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmingDelete} onOpenChange={(open) => !deleting && setConfirmingDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("songEditor.deleteTitle")}</DialogTitle>
            <DialogDescription>{t("songEditor.deleteDescription", { title: edit?.version.title ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              {t("songEditor.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting ? t("songEditor.deleting") : t("songEditor.deleteSong")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blocker.status === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("songEditor.leaveTitle")}</DialogTitle>
            <DialogDescription>{t("songEditor.leaveDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
              {t("songEditor.keepEditing")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
              {t("songEditor.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
