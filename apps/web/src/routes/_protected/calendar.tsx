import { addDays, localDate, type AwayDays, type MyEventDate } from "@songverse/core";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MapPin, Repeat, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarFeedCard } from "#/components/calendar-feed-card";
import { EntityAvatar } from "#/components/entity-avatar";
import { EventAnswer } from "#/components/event-answer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { apiClient } from "#/lib/api-client";
import { formatSetDate } from "#/lib/setlists";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_protected/calendar")({
  component: MyCalendarPage,
});

/** How far the page shows, then how much more each "Show more" adds. */
const SHOWN_WEEKS = 8;

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * My calendar (issue #235): the coming dates of all one's teams, each
 * answered here - Available, If needed, Not available, with a note for the
 * team's admins - and the days one is away, which answer Not available for
 * every date in them that isn't answered.
 */
function MyCalendarPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [weeks, setWeeks] = useState(SHOWN_WEEKS);
  const [dates, setDates] = useState<MyEventDate[] | null>(null);
  const [away, setAway] = useState<AwayDays[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = addDays(localDate(new Date(), browserZone()), -1);
    const [found, ranges] = await Promise.all([apiClient.listMyEventDates(today, addDays(today, weeks * 7)), apiClient.listMyAway()]);
    const now = Date.now();
    setDates(found.filter((date) => Date.parse(date.endsAt) >= now - 12 * 3600_000));
    setAway(ranges);
  }, [weeks]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await load();
      // The sidebar lists the sets of dates you signed up for.
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const dayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric", month: "short" });
  const timeFormat = (zone: string) => new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", timeZone: zone });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("teamCalendar.myCalendar")}</h1>
        <p className="text-sm text-muted-foreground">{t("teamCalendar.myCalendarDescription")}</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid grid-cols-1 items-start gap-6 @6xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card data-testid="my-calendar">
          <CardContent className="flex flex-col gap-4">
            {dates === null ? null : dates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("teamCalendar.noDates")}</p>
            ) : (
              <ul className="flex flex-col divide-y" aria-label={t("teamCalendar.myCalendar")}>
                {dates.map((date) => (
                  <li
                    key={`${date.eventId}-${date.date}`}
                    className={cn("flex flex-wrap items-start gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0", date.cancelled && "text-muted-foreground")}
                    data-event-date={date.date}
                    data-event-id={date.eventId}
                  >
                    <div className="w-28 shrink-0 text-sm tabular-nums">
                      <div className="font-medium">{dayFormat.format(new Date(`${date.date}T12:00:00Z`))}</div>
                      <div className="text-xs text-muted-foreground">{timeFormat(date.timeZone).format(new Date(date.startsAt))}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm font-medium", date.cancelled && "line-through")}>{date.title}</span>
                        {date.repeats ? <Repeat className="size-3.5 text-muted-foreground" aria-label={t("teamCalendar.repeats")} /> : null}
                        {date.cancelled ? <Badge variant="outline">{t("teamCalendar.cancelled")}</Badge> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <Link to="/teams/$teamId" params={{ teamId: date.teamId }} className="flex items-center gap-1.5 hover:text-foreground">
                          <EntityAvatar name={date.teamName} color={date.teamColor} avatarUrl={date.teamAvatarUrl} size={16} />
                          {date.teamName}
                        </Link>
                        {date.place ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {date.place}
                          </span>
                        ) : null}
                      </div>
                      {!date.cancelled ? (
                        <div className="mt-1">
                          <EventAnswer
                            value={date.myAnswer}
                            labels
                            label={t("teamCalendar.yourAnswer")}
                            onAnswer={(answer, note) => act(() => apiClient.answerTeamEventDate(date.teamId, date.eventId, date.date, { answer, ...(note !== undefined && { note }) }))}
                            onClear={() => act(() => apiClient.clearTeamEventDateAnswer(date.teamId, date.eventId, date.date))}
                          />
                        </div>
                      ) : null}
                    </div>
                    {!date.cancelled && date.setlistId ? (
                      <Button variant="outline" size="sm" render={<Link to="/sets/$setlistId" params={{ setlistId: date.setlistId }} />}>
                        {t("teamCalendar.openSet")}
                        <span className="text-muted-foreground">· {t("teamCalendar.songs", { count: date.songCount })}</span>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {dates && dates.length > 0 ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setWeeks((shown) => shown + SHOWN_WEEKS)}>
                {t("teamCalendar.showMore")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {/* The dates signed up for, in one's own calendar (issue #235). */}
          <CalendarFeedCard />
          <AwayCard away={away} locale={i18n.language} onAdd={(range) => act(() => apiClient.addMyAway(range))} onRemove={(id) => act(() => apiClient.removeMyAway(id))} />
        </div>
      </div>
    </div>
  );
}

/** The days one is away, for all one's teams: added with a first and last day, removed. */
function AwayCard({ away, locale, onAdd, onRemove }: { away: AwayDays[]; locale: string; onAdd: (range: { from: string; to: string; note: string | null }) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card data-testid="away-card">
      <CardHeader>
        <CardTitle className="text-sm">{t("teamCalendar.awayTitle")}</CardTitle>
        <CardDescription>{t("teamCalendar.awayDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {away.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("teamCalendar.noAway")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {away.map((range) => (
              <li key={range.id} className="flex items-center justify-between gap-2 py-2 first:pt-0" data-away-range={`${range.from}/${range.to}`}>
                <div className="min-w-0 text-sm">
                  <div>
                    {formatSetDate(range.from, locale)} – {formatSetDate(range.to, locale)}
                  </div>
                  {range.note ? <div className="truncate text-xs text-muted-foreground">{range.note}</div> : null}
                </div>
                <Button variant="ghost" size="icon" className="size-8" aria-label={t("teamCalendar.removeAway")} title={t("teamCalendar.removeAway")} onClick={() => void onRemove(range.id)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onAdd({ from, to, note: note.trim() || null }).then(() => {
              setFrom("");
              setTo("");
              setNote("");
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-from">{t("teamCalendar.awayFrom")}</Label>
            <Input id="away-from" type="date" value={from} required onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-to">{t("teamCalendar.awayTo")}</Label>
            <Input id="away-to" type="date" value={to} min={from || undefined} required onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="away-note">{t("teamCalendar.awayNote")}</Label>
            <Input id="away-note" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="sm" className="col-span-2 justify-self-start" data-testid="away-add">
            {t("teamCalendar.addAway")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
