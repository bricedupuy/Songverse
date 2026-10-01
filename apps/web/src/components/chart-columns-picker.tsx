import { Columns3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CHART_COLUMNS, setChartColumns, useChartColumns } from "#/lib/chart-columns";
import { cn } from "#/lib/utils";

/** The chart's columns (issue #177): Auto, 1, 2 or 3, remembered on the device. */
export function ChartColumnsPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const columns = useChartColumns();
  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("chart.columns")} data-testid="chart-columns">
      <Columns3 className="size-4 text-muted-foreground" aria-hidden />
      {CHART_COLUMNS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={columns === value}
          onClick={() => setChartColumns(value)}
          title={value === "auto" ? t("chart.columnsAuto") : t("chart.columnsCount", { count: Number(value) })}
          aria-label={value === "auto" ? t("chart.columnsAuto") : t("chart.columnsCount", { count: Number(value) })}
          data-testid={`chart-columns-${value}`}
          className={cn(
            "h-7 min-w-7 rounded-md px-1.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            columns === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {value === "auto" ? t("chart.columnsAutoShort") : value}
        </button>
      ))}
    </div>
  );
}
