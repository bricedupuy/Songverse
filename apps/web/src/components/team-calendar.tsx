import { addDays, localDate, type TeamEvent, type TeamEventDateSummary } from "@songverse/core";
import { Link, useNavigate } from "@tanstack/react-router";
import { Ban, CalendarPlus, MapPin, MoreHorizontal, Pencil, Repeat, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "#/components/confirm-button";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect } from "#/components/ui/native-select";
import { Textarea } from "#/components/ui/textarea";
import { apiClient } from "#/lib/api-client";
import { cn } from "#/lib/utils";

/** How far the calendar shows, then how much more each "Show more" adds. */
const SHOWN_WEEKS = 8;

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * A team's calendar (issue #235): its coming dates, every event's, each
 * with its set. Its admins add and edit events, cancel or restore a date,
 * plan a date's set however far ahead, and choose how far ahead the sets
 * are made.
 */
export function TeamCalendar({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(SHOWN_WEEKS);
  const [dates, setDates] = useState<TeamEventDateSummary[] | null>(null);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [editing, setEditing] = useState<TeamEvent | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // From today where the browser is: the API keeps a date until its own day is over.
    const today = addDays(localDate(new Date(), browserZone()), -1);
    const [found, all] = await Promise.all([apiClient.listTeamEventDates(teamId, today, addDays(today, weeks * 7)), apiClient.listTeamEvents(teamId)]);
    const now = Date.now();
    setDates(found.filter((date) => Date.parse(date.endsAt) >= now - 12 * 3600_000));
    setEvents(all);
  }, [teamId, weeks]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const planSet = (date: TeamEventDateSummary) =>
    act(async () => {
      const { setlistId } = await apiClient.ensureTeamEventDateSet(teamId, date.eventId, date.date);
      await navigate({ to: "/sets/$setlistId", params: { setlistId } });
    });

  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric", month: "short" });
  const timeFormat = (zone: string) => new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", timeZone: zone });

  return (
    <Card data-testid="team-calendar">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-sm">{t("teamCalendar.title")}</CardTitle>
          <CardDescription>{t("teamCalendar.description")}</CardDescription>
        </div>
        {isAdmin ? (
          <Button size="sm" onClick={() => setEditing("new")} data-testid="calendar-new-event">
            <CalendarPlus />
            {t("teamCalendar.newEvent")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {dates === null ? null : dates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{isAdmin ? t("teamCalendar.noEventsAdmin") : t("teamCalendar.noEvents")}</p>
        ) : (
          <ul className="flex flex-col divide-y" aria-label={t("teamCalendar.title")}>
            {dates.map((date) => {
              const event = events.find((one) => one.id === date.eventId);
              return (
                <li
                  key={`${date.eventId}-${date.date}`}
                  className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0", date.cancelled && "text-muted-foreground")}
                  data-event-date={date.date}
                  data-event-id={date.eventId}
                  data-cancelled={date.cancelled ? "" : undefined}
                >
                  <div className="w-28 shrink-0 text-sm tabular-nums">
                    <div className="font-medium">{dayFormat.format(new Date(`${date.date}T12:00:00Z`))}</div>
                    <div className="text-xs text-muted-foreground">{timeFormat(date.timeZone).format(new Date(date.startsAt))}</div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("text-sm font-medium", date.cancelled && "line-through")}>{date.title}</span>
                      {date.repeats ? <Repeat className="size-3.5 text-muted-foreground" aria-label={t("teamCalendar.repeats")} /> : null}
                      {date.cancelled ? <Badge variant="outline">{t("teamCalendar.cancelled")}</Badge> : null}
                    </div>
                    {date.place ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden />
                        {date.place}
                      </span>
                    ) : null}
                  </div>
                  {!date.cancelled && date.setlistId ? (
                    <Button variant="outline" size="sm" render={<Link to="/sets/$setlistId" params={{ setlistId: date.setlistId }} />} data-testid="calendar-open-set">
                      {t("teamCalendar.openSet")}
                      <span className="text-muted-foreground">· {t("teamCalendar.songs", { count: date.songCount })}</span>
                    </Button>
                  ) : !date.cancelled && isAdmin ? (
                    <Button variant="outline" size="sm" onClick={() => void planSet(date)} data-testid="calendar-plan-set">
                      {t("teamCalendar.planSet")}
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("teamCalendar.dateActions", { title: `${date.title}, ${dayFormat.format(new Date(`${date.date}T12:00:00Z`))}` })} />}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void act(() => apiClient.updateTeamEventDate(teamId, date.eventId, date.date, { cancelled: !date.cancelled }))} data-testid="calendar-toggle-date">
                          {date.cancelled ? <RotateCcw /> : <Ban />}
                          {date.cancelled ? t("teamCalendar.restoreDate") : t("teamCalendar.cancelDate")}
                        </DropdownMenuItem>
                        {event ? (
                          <DropdownMenuItem onClick={() => setEditing(event)} data-testid="calendar-edit-event">
                            <Pencil />
                            {t("teamCalendar.editEvent")}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {dates && dates.length > 0 ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setWeeks((shown) => shown + SHOWN_WEEKS)}>
            {t("teamCalendar.showMore")}
          </Button>
        ) : null}
        {isAdmin ? <SetsAhead teamId={teamId} onSaved={load} /> : null}
      </CardContent>
      {editing ? (
        <EventDialog
          teamId={teamId}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </Card>
  );
}

/** The team's "Create sets ahead", in weeks (1 to 52). */
function SetsAhead({ teamId, onSaved }: { teamId: string; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void apiClient.getTeamCalendarSettings(teamId).then((settings) => setWeeks(String(settings.setsAheadWeeks)));
  }, [teamId]);
  const value = Number(weeks);
  const valid = Number.isInteger(value) && value >= 1 && value <= 52;
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void apiClient.updateTeamCalendarSettings(teamId, { setsAheadWeeks: value }).then(async () => {
          setSaved(true);
          await onSaved();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sets-ahead">{t("teamCalendar.setsAhead")}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="sets-ahead"
            type="number"
            min={1}
            max={52}
            value={weeks}
            onChange={(event) => {
              setWeeks(event.target.value);
              setSaved(false);
            }}
            className="w-20"
            data-testid="calendar-sets-ahead"
          />
          <span className="text-sm text-muted-foreground">{t("teamCalendar.weeks")}</span>
        </div>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={!valid} data-testid="calendar-sets-ahead-save">
        {saved ? t("teamCalendar.savedSetting") : t("teamCalendar.saveSetting")}
      </Button>
      <p className="basis-full text-xs text-muted-foreground">{t("teamCalendar.setsAheadHelp")}</p>
    </form>
  );
}

/** Adding or editing an event: its title, first date and time, how long, where, and whether it repeats. */
function EventDialog({ teamId, event, onClose, onSaved }: { teamId: string; event: TeamEvent | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? localDate(new Date(), browserZone()));
  const [startTime, setStartTime] = useState(event?.startTime ?? "10:00");
  const [duration, setDuration] = useState(String(event?.durationMinutes ?? 90));
  const [timeZone, setTimeZone] = useState(event?.timeZone ?? browserZone());
  const [place, setPlace] = useState(event?.place ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const [everyWeeks, setEveryWeeks] = useState(event?.repeat ? String(event.repeat.everyWeeks) : "");
  const [until, setUntil] = useState(event?.repeat?.until ?? "");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timeZone];

  const save = async () => {
    setBusy(true);
    setError(null);
    const repeat = everyWeeks ? { everyWeeks: Number(everyWeeks), until: until || null } : null;
    const body = { title, date, startTime, durationMinutes: Number(duration), timeZone, place: place || null, note: note || null, repeat };
    try {
      if (event) await apiClient.updateTeamEvent(teamId, event.id, body);
      else await apiClient.createTeamEvent(teamId, body);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="event-dialog">
        <DialogHeader>
          <DialogTitle>{event ? t("teamCalendar.editEvent") : t("teamCalendar.newEvent")}</DialogTitle>
        </DialogHeader>
        <form
          id="event-form"
          className="grid grid-cols-2 gap-3"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            void save();
          }}
        >
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="event-title">{t("teamCalendar.eventTitle")}</Label>
            <Input id="event-title" value={title} maxLength={120} required placeholder={t("teamCalendar.titlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-date">{t("teamCalendar.firstDate")}</Label>
            <Input id="event-date" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-time">{t("teamCalendar.startTime")}</Label>
            <Input id="event-time" type="time" value={startTime} required onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-duration">{t("teamCalendar.duration")}</Label>
            <Input id="event-duration" type="number" min={5} max={1440} value={duration} required onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-zone">{t("teamCalendar.timeZone")}</Label>
            <NativeSelect id="event-zone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {(zones.includes(timeZone) ? zones : [timeZone, ...zones]).map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-repeat">{t("teamCalendar.repeat")}</Label>
            <NativeSelect id="event-repeat" value={everyWeeks} onChange={(e) => setEveryWeeks(e.target.value)}>
              <option value="">{t("teamCalendar.oneOff")}</option>
              {[1, 2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={String(n)}>
                  {t("teamCalendar.everyNWeeks", { count: n })}
                </option>
              ))}
              {everyWeeks && ![1, 2, 3, 4, 6, 8].includes(Number(everyWeeks)) ? <option value={everyWeeks}>{t("teamCalendar.everyNWeeks", { count: Number(everyWeeks) })}</option> : null}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-until">{t("teamCalendar.until")}</Label>
            <Input id="event-until" type="date" value={until} min={date} disabled={!everyWeeks} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="event-place">{t("teamCalendar.place")}</Label>
            <Input id="event-place" value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="event-note">{t("teamCalendar.note")}</Label>
            <Textarea id="event-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
          </div>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="flex flex-wrap items-center gap-2 sm:justify-between">
          {event ? (
            <ConfirmButton
              label={t("teamCalendar.deleteEvent")}
              confirmLabel={t("teamCalendar.confirmDelete")}
              busyLabel={t("teamCalendar.deleting")}
              cancelLabel={t("teamCalendar.cancel")}
              busy={deleting}
              onConfirm={async () => {
                setDeleting(true);
                await apiClient.deleteTeamEvent(teamId, event.id);
                await onSaved();
              }}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("teamCalendar.cancel")}
            </Button>
            <Button type="submit" form="event-form" disabled={busy}>
              {busy ? t("teamCalendar.saving") : t("teamCalendar.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
