/**
 * Lossless "long format" CSV for heterogeneous exports: one row per leaf value.
 * Columns: dataset, record, field, value. Nested objects are flattened with dot paths.
 */
export function toLongCsv(datasets: Record<string, unknown>): string {
  const rows: string[][] = [["dataset", "record", "field", "value"]];
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const walk = (dataset: string, record: string, prefix: string, v: unknown) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      if (!entries.length) rows.push([dataset, record, prefix, "{}"]);
      for (const [k, x] of entries) walk(dataset, record, prefix ? `${prefix}.${k}` : k, x);
      return;
    }
    if (Array.isArray(v) && v.some((x) => x !== null && typeof x === "object")) {
      v.forEach((x, i) => walk(dataset, record, `${prefix}[${i}]`, x));
      return;
    }
    rows.push([dataset, record, prefix, v === undefined || v === null ? "" : Array.isArray(v) ? JSON.stringify(v) : String(v)]);
  };
  for (const [name, value] of Object.entries(datasets)) {
    if (Array.isArray(value)) value.forEach((item, i) => walk(name, String(i), "", item));
    else walk(name, "0", "", value);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
