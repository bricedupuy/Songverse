import type { AdminUserSummary } from "@songverse/core";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { sizedAvatarUrl } from "#/lib/avatar-url";
import { formatBytes } from "#/lib/format-bytes";
import { initials } from "#/lib/initials";

export type UserAction = "storage" | "ban" | "unban" | "delete" | "newTransferLink" | "deleteNow";

function sortableHeader(label: string) {
  return function SortableHeader({ column }: { column: Column<AdminUserSummary, unknown> }) {
    return (
      <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        {label}
        <ArrowUpDown />
      </Button>
    );
  };
}

export function useUsersColumns(currentUserId: string, onAction: (action: UserAction, user: AdminUserSummary) => void) {
  const { t, i18n } = useTranslation();

  return useMemo<ColumnDef<AdminUserSummary>[]>(() => {
    const formatDate = (value: string) => new Date(value).toLocaleDateString(i18n.language);

    return [
      {
        id: "user",
        // Name and email together, so the table's search box matches either.
        accessorFn: (user) => `${user.displayName} ${user.email}`,
        header: sortableHeader(t("admin.columnUser")),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-8 shrink-0">
                {user.avatarUrl ? <AvatarImage src={sizedAvatarUrl(user.avatarUrl, 32)} alt="" /> : null}
                <AvatarFallback className="text-xs">{initials(user.displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{user.displayName}</span>
                  {user.id === currentUserId ? <span className="text-xs font-normal text-muted-foreground">({t("admin.you")})</span> : null}
                  {user.isGlobalAdmin ? <Badge>{t("admin.globalAdmin")}</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        accessorFn: (user) =>
          user.deletedAt ? "deleted" : user.bannedAt ? "banned" : user.emailVerified ? "verified" : "unverified",
        header: t("admin.columnStatus"),
        cell: ({ row }) => {
          const user = row.original;
          if (user.deletedAt && user.transferExpiresAt) {
            return <Badge variant="warning">{t("admin.statusPendingTransfer", { date: formatDate(user.transferExpiresAt) })}</Badge>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {user.bannedAt ? (
                <Badge variant="destructive" title={user.banReason ?? undefined}>
                  {t("admin.statusBanned")}
                </Badge>
              ) : null}
              <Badge variant={user.emailVerified ? "muted" : "warning"}>
                {user.emailVerified ? t("admin.statusVerified") : t("admin.statusUnverified")}
              </Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "songCount",
        header: sortableHeader(t("admin.columnSongs")),
      },
      {
        accessorKey: "usedBytes",
        header: sortableHeader(t("admin.columnStorage")),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="text-sm">
              <p>
                {formatBytes(user.usedBytes)} / {user.limitBytes === null ? t("admin.storageUnlimited") : formatBytes(user.limitBytes)}
              </p>
              {user.storageLimitMb !== null && !user.isGlobalAdmin ? (
                <p className="text-xs text-muted-foreground">{t("admin.storageCustomLimit")}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: sortableHeader(t("admin.columnJoined")),
        cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUserId;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={t("admin.userActions", { name: user.displayName })}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {user.deletedAt ? (
                  <>
                    <DropdownMenuItem onSelect={() => onAction("newTransferLink", user)}>{t("admin.actionNewTransferLink")}</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onAction("deleteNow", user)}>
                      {t("admin.actionDeleteNow")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={() => onAction("storage", user)}>{t("admin.actionEditStorage")}</DropdownMenuItem>
                    {isSelf ? null : (
                      <>
                        {user.bannedAt ? (
                          <DropdownMenuItem onSelect={() => onAction("unban", user)}>{t("admin.actionUnban")}</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => onAction("ban", user)}>{t("admin.actionBan")}</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete", user)}>
                          {t("admin.actionDelete")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
  }, [t, i18n.language, currentUserId, onAction]);
}
