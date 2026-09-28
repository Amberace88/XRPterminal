"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./Button";
import { EmptyState, SkeletonRows } from "./States";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** value used for sorting & CSV export */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  /** hide below this breakpoint */
  hideBelow?: "sm" | "md" | "lg";
  sortable?: boolean;
}

/** Reusable table: sorting, pagination, CSV export, responsive column hiding (spec §235). */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  pageSize = 20,
  csvName,
  initialSort,
  onRowClick,
  dense = true,
  className,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T, i: number) => string;
  loading?: boolean;
  empty?: { title: string; description?: React.ReactNode; action?: React.ReactNode };
  pageSize?: number;
  csvName?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  dense?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return rows;
    const v = col.value;
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const exportCsv = () => {
    const cols = columns.filter((c) => c.value);
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = cols.map((c) => esc(typeof c.header === "string" ? c.header : c.key)).join(",");
    const body = sorted.map((r) => cols.map((c) => esc(c.value!(r))).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hide = (h?: string) => (h === "sm" ? "hidden sm:table-cell" : h === "md" ? "hidden md:table-cell" : h === "lg" ? "hidden lg:table-cell" : "");

  if (loading && !rows) return <SkeletonRows rows={6} className="p-4" />;
  if (!loading && rows && rows.length === 0 && empty) return <EmptyState {...empty} />;

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {columns.map((c) => {
                const canSort = c.sortable !== false && !!c.value;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "label whitespace-nowrap px-3 py-2 font-medium",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      hide(c.hideBelow),
                      c.className,
                    )}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {canSort ? (
                      <button
                        className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}
                        onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "desc" }))}
                      >
                        {c.header}
                        {active && (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {current.map((r, i) => (
              <tr
                key={rowKey(r, i)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn("border-b border-border-subtle/60 last:border-0 hover:bg-surface-hover/60", onRowClick && "cursor-pointer")}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 align-middle",
                      dense ? "py-2" : "py-3",
                      c.align === "right" ? "num text-right" : c.align === "center" ? "text-center" : "text-left",
                      hide(c.hideBelow),
                      c.className,
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(pages > 1 || csvName) && (
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 text-2xs text-fg-muted">
          <span>
            {sorted.length} rows{pages > 1 && ` · page ${page + 1} / ${pages}`}
          </span>
          <div className="flex items-center gap-1">
            {csvName && (
              <Button variant="ghost" size="xs" onClick={exportCsv}>
                <Download className="h-3 w-3" /> CSV
              </Button>
            )}
            {pages > 1 && (
              <>
                <Button variant="ghost" size="xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
