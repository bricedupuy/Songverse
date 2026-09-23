import { resolveTranslation, type LocaleValue, type SongVersionSummary } from "@songverse/core";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";

function artistLabel(artists: SongVersionSummary["artists"]): string {
  if (artists.length === 0) return "—";
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
}

function tagLabel(tags: SongVersionSummary["tags"], locale: LocaleValue): string {
  if (tags.length === 0) return "—";
  return tags.map((tag) => resolveTranslation(tag.label, tag.translations, locale)).join(", ");
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
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: "artist",
        accessorFn: (version) => artistLabel(version.artists),
        header: sortableHeader(t("library.columnArtist")),
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
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.publicationState}</span>,
      },
      {
        id: "tags",
        meta: { secondary: true },
        accessorFn: (version) => tagLabel(version.tags, locale),
        header: sortableHeader(t("library.columnTags")),
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
