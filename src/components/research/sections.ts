/** Report sections map onto data-brief section ids. */
export const REPORT_SECTIONS: { id: string; label: string; briefIds: string[] }[] = [
  { id: "market", label: "Market snapshot", briefIds: ["snapshot", "changed", "why"] },
  { id: "xrpl", label: "XRPL activity", briefIds: ["xrpl", "whales", "flows"] },
  { id: "historical", label: "Historical context", briefIds: ["historical"] },
  { id: "news", label: "News & events", briefIds: ["news"] },
  { id: "scenarios", label: "Scenarios", briefIds: ["scenarios"] },
  { id: "risks", label: "Risks & watch items", briefIds: ["risks", "watch"] },
];
