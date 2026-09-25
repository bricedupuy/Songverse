import { CommandSearch } from "#/components/command-search";
import { ModeSwitch } from "#/components/mode-switch";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { useMode } from "#/lib/mode";
import { cn } from "#/lib/utils";

/**
 * The top of every page: the sidebar's toggle, search and the mode switch.
 * No breadcrumb (issue #67): the sidebar shows where you are, and the
 * page's own title names it.
 */
export function SiteHeader() {
  const { mode } = useMode();

  return (
    <header className={cn("flex h-14 shrink-0 items-center gap-2 border-b", mode !== "edit" && "border-b-2 border-b-primary")}>
      <div className="flex w-full min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <div className="ml-auto flex items-center gap-2">
          <CommandSearch />
          <ModeSwitch />
        </div>
      </div>
    </header>
  );
}
