import { resolveTranslation, type LocaleValue, type SongVersionSummary } from "@songverse/core";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "#/components/ui/button";
import { artistNames } from "#/lib/artists";

function tagLabel(tags: SongVersionSummary["tags"], locale: LocaleValue): string {
  if (tags.length === 0) return "—";
  return tags.map((tag) => resolveTranslation(tag.label, tag.translations, locale)).join(", ");
}

function plainHeader(label: string) {
  return function PlainHeader() {
    return <span>{label}</span>;
  };
}

function sortableHeader(label: string) {
  return function SortableHeader({ column }: { column: Column<SongVersionSummary, unknown> }) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {label}
        <ArrowUpDown />
      </Button>
    );
  };
}

export function useLibraryColumns(): ColumnDef<SongVersionSummary>[] {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as LocaleValue;

  return useMemo(
    () => [
      {
        accessorKey: "title",
        header: sortableHeader(t("library.columnTitle")),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.title}
            {row.original.versionName ? <span className="font-normal text-muted-foreground"> — {row.original.versionName}</span> : null}
          </span>
        ),
      },
      {
        id: "artist",
        accessorFn: (version) => artistNames(version.artists) ?? "—",
        // The list is sorted by the server, which sorts by the song's own
        // fields; artists and tags are credits and links, not columns.
        enableSorting: false,
        header: plainHeader(t("library.columnArtist")),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: "language",
        meta: { secondary: true },
        header: sortableHeader(t("library.columnLanguage")),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.language}</span>,
      },
      {
        accessorKey: "publicationState",
        meta: { secondary: true },
        header: sortableHeader(t("library.columnStatus")),
        cell: ({ row }) => <span className="text-muted-foreground">{statusLabel(row.original, t)}</span>,
      },
      {
        id: "tags",
        meta: { secondary: true },
        accessorFn: (version) => tagLabel(version.tags, locale),
        enableSorting: false,
        header: plainHeader(t("library.columnTags")),
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: "updatedAt",
        meta: { secondary: true },
        header: sortableHeader(t("library.columnUpdated")),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString()}</span>
        ),
      },
    ],
    [t, locale],
  );
}

/**
 * Where a song stands, readably (issue #46): one never offered to the
 * catalogue is simply the user's or their team's; after that, where its
 * submission is, in the publish card's words.
 */
function statusLabel(version: Pick<SongVersionSummary, "publicationState" | "ownerScope">, t: TFunction): string {
  switch (version.publicationState) {
    case "DRAFT":
      return version.ownerScope === "USER" ? t("library.statusPersonal") : version.ownerScope === "TEAM" ? t("library.statusTeam") : t("library.statusDraft");
    case "ARCHIVED":
      return t("library.statusArchived");
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "NEEDS_CHANGES":
    case "APPROVED":
    case "REJECTED":
    case "WITHDRAWN":
      return t(`publish.state${version.publicationState}`);
    default:
      return version.publicationState;
  }
}
