import type { SongVersionSummary } from "@songverse/core";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "#/components/ui/button";

function artistLabel(artists: SongVersionSummary["artists"]): string {
  if (artists.length === 0) return "—";
  return artists.map((a) => a.source ?? a.userId ?? "Unknown artist").join(", ");
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

export const libraryColumns: ColumnDef<SongVersionSummary>[] = [
  {
    accessorKey: "title",
    header: sortableHeader("Title"),
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    id: "artist",
    accessorFn: (version) => artistLabel(version.artists),
    header: sortableHeader("Artist"),
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
  },
  {
    accessorKey: "language",
    header: sortableHeader("Language"),
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.language}</span>,
  },
  {
    accessorKey: "publicationState",
    header: sortableHeader("Status"),
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.publicationState}</span>,
  },
  {
    accessorKey: "updatedAt",
    header: sortableHeader("Updated"),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString()}</span>
    ),
  },
];
