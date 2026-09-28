import { cn } from "@/lib/utils/cn";

/** Minimal SVG sparkline (server-safe). Color follows direction unless overridden. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
  tone,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  tone?: "up" | "down" | "accent";
  fill?: boolean;
}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * width, height - 2 - ((x - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dir = tone ?? (v[v.length - 1] >= v[0] ? "up" : "down");
  const color = dir === "up" ? "rgb(var(--success))" : dir === "down" ? "rgb(var(--danger))" : "rgb(var(--accent))";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} aria-hidden>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.08} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
