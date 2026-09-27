import { RadioTower, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { unlockMetronomeAudio, useMetronome } from "#/lib/metronome-engine";
import { disableSync, enableSync, endSync, leadSync, useSync } from "#/lib/sync-client";
import { cn } from "#/lib/utils";

/**
 * Sync play (issue #13) for a set: on or off, who leads, and Lead or End
 * for those who can edit the set. On a set's page, its songs and Live.
 */
export function SyncControl({ setId, compact = false, className }: { setId: string; compact?: boolean; className?: string }) {
  const { t } = useTranslation();
  const sync = useSync();
  const metronome = useMetronome();
  const on = sync.setId === setId && sync.status !== "off";
  const session = on ? sync.session : null;
  const following = on && !!session && !sync.leading;
  const blocked = following && metronome.audioBlocked;
  const label = !on
    ? t("sync.button")
    : sync.leading
      ? t("sync.leading")
      : session
        ? t("sync.followingShort", { name: session.leader.name })
        : t("sync.button");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={on ? "default" : "outline"}
          size={compact ? "icon" : "default"}
          className={cn(blocked && "animate-pulse ring-2 ring-amber-500", compact && "size-10", className)}
          aria-label={compact ? label : undefined}
          title={label}
          data-testid="sync-control"
          data-state-sync={!on ? "off" : sync.leading ? "leading" : session ? "following" : "on"}
        >
          <RadioTower />
          {compact ? null : <span className="max-w-40 truncate">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" data-testid="sync-menu">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span>{t("sync.title")}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {!on
              ? t("sync.description")
              : sync.status === "connecting" && !session
                ? t("sync.connecting")
                : sync.leading
                  ? t("sync.leading")
                  : session
                    ? session.leader.online
                      ? t("sync.leaderIs", { name: session.leader.name })
                      : t("sync.leaderOffline", { name: session.leader.name })
                    : sync.canLead
                      ? t("sync.noLeader")
                      : t("sync.waitingForLeader")}
          </span>
          {on && sync.members.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground" data-testid="sync-members">
              {t("sync.inSync", { count: sync.members.length })} · {[...new Set(sync.members.map((member) => member.name))].slice(0, 6).join(", ")}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {blocked ? (
          <DropdownMenuItem onSelect={unlockMetronomeAudio}>
            <Volume2 />
            {t("sync.tapToHear")}
          </DropdownMenuItem>
        ) : null}
        {!on ? (
          <DropdownMenuItem
            onSelect={() => {
              // Within the press: the browser lets the metronome make sound from now on.
              unlockMetronomeAudio();
              enableSync(setId);
            }}
          >
            {t("sync.turnOn")}
          </DropdownMenuItem>
        ) : (
          <>
            {sync.canLead && !sync.leading && sync.status === "on" ? (
              <DropdownMenuItem onSelect={leadSync}>{session ? t("sync.leadInstead") : t("sync.lead")}</DropdownMenuItem>
            ) : null}
            {sync.canLead && session ? (
              <DropdownMenuItem variant="destructive" onSelect={endSync} title={t("sync.endConfirm")}>
                {t("sync.end")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={disableSync}>{t("sync.turnOff")}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
