import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Mic, Moon, PencilRuler, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { setMode, setPerformTheme, useMode, type AppMode } from "#/lib/mode";
import { cn } from "#/lib/utils";

const SET_SONG = /^\/sets\/([^/]+)\/(songs|perform)\/([^/]+)\/?$/;

/**
 * Build / Perform, at the top right of every page, and in Perform a sun or
 * moon for its light or dark stage theme. On a song of a set, switching
 * also moves between its page and its full-screen Perform view.
 */
export function ModeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { mode, performTheme } = useMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  function choose(next: AppMode) {
    if (next === mode) return;
    setMode(next);
    const setSong = SET_SONG.exec(pathname);
    if (setSong) {
      const params = { setlistId: setSong[1]!, itemId: setSong[3]! };
      void navigate(next === "perform" ? { to: "/sets/$setlistId/perform/$itemId", params } : { to: "/sets/$setlistId/songs/$itemId", params });
    }
  }

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <div role="radiogroup" aria-label={t("mode.label")} className="flex rounded-lg border bg-muted p-0.5" data-testid="mode-switch">
        <ModeButton active={mode === "build"} label={t("mode.build")} onClick={() => choose("build")}>
          <PencilRuler />
        </ModeButton>
        <ModeButton active={mode === "perform"} label={t("mode.perform")} onClick={() => choose("perform")}>
          <Mic />
        </ModeButton>
      </div>
      {mode === "perform" ? (
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground [&_svg]:size-4"
          aria-label={performTheme === "dark" ? t("mode.lightTheme") : t("mode.darkTheme")}
          title={performTheme === "dark" ? t("mode.lightTheme") : t("mode.darkTheme")}
          onClick={() => setPerformTheme(performTheme === "dark" ? "light" : "dark")}
        >
          {performTheme === "dark" ? <Sun /> : <Moon />}
        </button>
      ) : null}
    </div>
  );
}

function ModeButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors [&_svg]:size-3.5",
        active ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {/* Icons only on a phone, where the header is narrow. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}
