"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MetricCard, toneOf } from "@/components/ui/MetricCard";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { GLOSSARY } from "@/components/ui/Tooltip";
import { formatDateTime, formatDuration } from "@/lib/format";
import { openOrders, orderHistory } from "@/lib/tradelab/engine";
import type { AccountState, AccountSummary, Fill, Order } from "@/lib/tradelab/types";
import { OrderStatusBadge, PnL, SideBadge, pct, px, qtyFmt, susd, usd } from "./common";

/** Account summary strip (spec §102, §103). */
export function AccountStrip({ summary, compact }: { summary: AccountSummary | null; compact?: boolean }) {
  const loading = !summary;
  const s = summary;
  const items = [
    { label: "Equity", value: usd(s?.equity), delta: s ? pct(s.returnPct) : undefined, tone: toneOf(s?.returnPct), info: "Cash + position value at the current mark price." },
    { label: "Cash", value: usd(s?.cash), sub: s && s.reservedCash > 0 ? `${usd(s.reservedCash)} reserved` : undefined, info: "Virtual cash. Open buy orders reserve cash (incl. estimated fee)." },
    { label: "Position value", value: usd(s?.positionValue), sub: s && s.positionQty > 0 ? `${qtyFmt(s.positionQty)} XRP` : "Flat" },
    { label: "Unrealized P&L", value: <PnL value={s?.unrealizedPnl ?? null} />, info: "(mark − average entry) × quantity. Long-only." },
    { label: "Realized P&L", value: <PnL value={s?.realizedGross ?? null} />, sub: s ? `Fees ${usd(s.feesPaid)}` : undefined, info: "Gross realized P&L from closed quantity; fees are shown separately." },
    { label: "Drawdown", value: s ? pct(-s.drawdownPct, 2) : "—", sub: s ? `Max ${pct(-s.maxDrawdownPct, 2)}` : undefined, info: GLOSSARY.drawdown, tone: s && s.drawdownPct > 0 ? ("down" as const) : ("neutral" as const) },
  ];
  return (
    <div className={compact ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"}>
      {items.map((it) => (
        <MetricCard key={it.label} size="sm" loading={loading} label={it.label} value={it.value} delta={it.delta} deltaTone={it.tone} sub={it.sub} info={it.info} className="p-3" />
      ))}
    </div>
  );
}

export function PositionsTable({ state, summary, onClose, closeLabel = "Close" }: { state: AccountState; summary: AccountSummary | null; onClose?: () => void; closeLabel?: string }) {
  const [confirm, setConfirm] = useState(false);
  const p = state.position;
  const legs = openOrders(state).filter((o) => o.side === "SELL");
  const sl = legs.find((o) => o.role === "STOP_LOSS");
  const tp = legs.find((o) => o.role === "TAKE_PROFIT");
  const rows = p ? [p] : [];
  const mark = summary?.markPrice ?? null;
  const cols: Column<NonNullable<typeof p>>[] = [
    { key: "asset", header: "Asset", cell: () => <span className="font-medium text-fg">XRP-USD</span> },
    { key: "side", header: "Side", cell: () => <SideBadge side="LONG" /> },
    { key: "qty", header: "Qty", align: "right", cell: (r) => qtyFmt(r.qty) },
    { key: "entry", header: "Avg entry", align: "right", cell: (r) => px(r.avgEntry) },
    { key: "mark", header: "Current", align: "right", cell: () => px(mark) },
    { key: "upnl", header: "Unrealized", align: "right", cell: () => <PnL value={summary?.unrealizedPnl ?? null} pctValue={summary?.unrealizedPct ?? null} /> },
    { key: "rpnl", header: "Realized", align: "right", hideBelow: "md", cell: (r) => <PnL value={Number(r.realizedGross)} /> },
    { key: "sl", header: "Stop-loss", align: "right", hideBelow: "sm", cell: () => (sl ? px(sl.stopPrice) : <span className="text-warning">None</span>) },
    { key: "tp", header: "Take-profit", align: "right", hideBelow: "sm", cell: () => (tp ? px(tp.limitPrice) : "—") },
    { key: "fees", header: "Fees", align: "right", hideBelow: "lg", cell: (r) => usd(Number(r.fees), 4) },
    { key: "slip", header: "Slippage", align: "right", hideBelow: "lg", cell: (r) => usd(Number(r.slippageCost), 4) },
    { key: "hold", header: "Holding", align: "right", hideBelow: "md", cell: (r) => formatDuration((state.lastPriceT ?? r.openedAt) - r.openedAt) },
    ...(onClose
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: () => (
              <Button size="xs" variant="outline" onClick={() => setConfirm(true)}>
                {closeLabel}
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} empty={{ title: "No open position", description: "Place a simulated buy to open a long XRP position." }} />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Close simulated position?"
        description="Cancels the attached stop-loss / take-profit and sells the full position at market (simulated)."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
              Keep position
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onClose?.();
                setConfirm(false);
              }}
            >
              Close at market
            </Button>
          </>
        }
      >
        {p && (
          <p className="text-sm text-fg-secondary">
            Sell {qtyFmt(p.qty)} XRP ≈ {usd(Number(p.qty) * (mark ?? 0))} before fees and slippage.
          </p>
        )}
      </Modal>
    </>
  );
}

const typeLabel = (o: Order) => `${o.type.replace("_", "-")}${o.role === "STOP_LOSS" ? " · SL" : o.role === "TAKE_PROFIT" ? " · TP" : ""}`;

export function OpenOrdersTable({ state, onCancel }: { state: AccountState; onCancel?: (id: string) => void }) {
  const rows = openOrders(state).slice().reverse();
  const cols: Column<Order>[] = [
    { key: "time", header: "Created", value: (o) => o.createdAt, cell: (o) => <span className="text-fg-muted">{formatDateTime(o.createdAt, undefined, false)}</span>, hideBelow: "md" },
    { key: "side", header: "Side", cell: (o) => <SideBadge side={o.side} /> },
    { key: "type", header: "Type", cell: (o) => <span className="text-xs">{typeLabel(o)}</span> },
    { key: "qty", header: "Qty", align: "right", cell: (o) => qtyFmt(o.qty) },
    { key: "filled", header: "Filled", align: "right", hideBelow: "sm", cell: (o) => qtyFmt(o.filledQty) },
    { key: "stop", header: "Stop", align: "right", cell: (o) => px(o.stopPrice) },
    { key: "limit", header: "Limit", align: "right", cell: (o) => px(o.limitPrice) },
    { key: "tif", header: "TIF", hideBelow: "lg", cell: (o) => (o.tif === "DAY" ? `DAY (${formatDateTime(o.expiresAt, "UTC", false)})` : "GTC") },
    { key: "status", header: "Status", cell: (o) => <OrderStatusBadge status={o.status} /> },
    ...(onCancel
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (o: Order) => (
              <Button size="xs" variant="ghost" aria-label={`Cancel order ${o.id}`} onClick={() => onCancel(o.id)}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            ),
          },
        ]
      : []),
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(o) => o.id} empty={{ title: "No open orders", description: "Limit, stop and attached SL/TP orders appear here while they rest." }} pageSize={10} />;
}

export function OrderHistoryTable({ state }: { state: AccountState }) {
  const rows = useMemo(() => orderHistory(state).slice().reverse(), [state]);
  const cols: Column<Order>[] = [
    { key: "time", header: "Updated", value: (o) => o.updatedAt, cell: (o) => <span className="text-fg-muted">{formatDateTime(o.updatedAt, undefined, false)}</span> },
    { key: "side", header: "Side", cell: (o) => <SideBadge side={o.side} /> },
    { key: "type", header: "Type", value: (o) => o.type, cell: (o) => <span className="text-xs">{typeLabel(o)}</span> },
    { key: "qty", header: "Qty", align: "right", value: (o) => Number(o.qty), cell: (o) => qtyFmt(o.qty) },
    { key: "filled", header: "Filled", align: "right", value: (o) => Number(o.filledQty), cell: (o) => qtyFmt(o.filledQty) },
    { key: "avg", header: "Avg fill", align: "right", value: (o) => (o.avgFillPrice ? Number(o.avgFillPrice) : null), cell: (o) => px(o.avgFillPrice) },
    { key: "trig", header: "Triggered", hideBelow: "lg", cell: (o) => (o.triggeredAt ? `${formatDateTime(o.triggeredAt, undefined, false)} @ ${px(o.triggerObservedPrice)}` : "—") },
    { key: "fees", header: "Fees", align: "right", hideBelow: "md", value: (o) => Number(o.fees), cell: (o) => usd(Number(o.fees), 4) },
    { key: "status", header: "Status", value: (o) => o.status, cell: (o) => <OrderStatusBadge status={o.status} /> },
    { key: "reason", header: "Reason", hideBelow: "md", value: (o) => o.reason ?? "", cell: (o) => <span className="line-clamp-2 max-w-[260px] text-2xs text-fg-muted">{o.reason ?? o.note ?? ""}</span> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(o) => o.id} csvName="trade-lab-orders-simulated" empty={{ title: "No order history yet" }} pageSize={10} />;
}

export function FillsTable({ state }: { state: AccountState }) {
  const rows = useMemo(() => state.fills.slice().reverse(), [state.fills]);
  const cols: Column<Fill>[] = [
    { key: "time", header: "Time", value: (f) => f.t, cell: (f) => <span className="text-fg-muted">{formatDateTime(f.t, undefined, false)}</span> },
    { key: "side", header: "Side", cell: (f) => <SideBadge side={f.side} /> },
    { key: "qty", header: "Qty", align: "right", value: (f) => Number(f.qty), cell: (f) => qtyFmt(f.qty) },
    { key: "price", header: "Fill price", align: "right", value: (f) => Number(f.price), cell: (f) => px(f.price) },
    { key: "ref", header: "Reference", align: "right", hideBelow: "md", value: (f) => Number(f.refPrice), cell: (f) => px(f.refPrice) },
    { key: "slip", header: "Slippage", align: "right", hideBelow: "sm", value: (f) => f.slippageBps, cell: (f) => `${f.slippageBps.toFixed(1)} bps · ${usd(Number(f.slippageCost), 4)}` },
    { key: "gross", header: "Gross", align: "right", value: (f) => Number(f.gross), cell: (f) => usd(Number(f.gross)) },
    { key: "fee", header: "Fee", align: "right", value: (f) => Number(f.feeAmount), cell: (f) => `${usd(Number(f.feeAmount), 4)} (${f.feeRate}%)` },
    { key: "net", header: "Net", align: "right", hideBelow: "sm", value: (f) => Number(f.net), cell: (f) => (f.side === "BUY" ? susd(-Number(f.net)) : susd(Number(f.net))) },
    { key: "liq", header: "Liquidity", hideBelow: "lg", value: (f) => f.liquidity, cell: (f) => <span className="text-2xs text-fg-muted">{f.liquidity}</span> },
    { key: "src", header: "Fee / price source", hideBelow: "lg", value: (f) => `${f.feeSource} | ${f.snapshotSource ?? ""}`, cell: (f) => <span className="line-clamp-2 max-w-[240px] text-2xs text-fg-muted">{f.feeSource}{f.snapshotSource ? ` · price: ${f.snapshotSource}` : ""}</span> },
  ];
  return <DataTable rows={rows} columns={cols} rowKey={(f) => f.id} csvName="trade-lab-fills-simulated" empty={{ title: "No fills yet" }} pageSize={10} />;
}

export type ActivityTab = "positions" | "orders" | "history" | "fills";

export function ActivityTabs({ state, summary, onCancel, onClose, extraTab }: { state: AccountState; summary: AccountSummary | null; onCancel?: (id: string) => void; onClose?: () => void; extraTab?: { label: string; node: React.ReactNode } }) {
  const [tab, setTab] = useState<ActivityTab | "extra">("positions");
  const nOpen = openOrders(state).length;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 sm:px-5">
        <Tabs
          value={tab}
          onChange={setTab}
          size="sm"
          ariaLabel="Account activity"
          items={[
            { value: "positions", label: `Positions${state.position ? " (1)" : ""}` },
            { value: "orders", label: `Open orders${nOpen ? ` (${nOpen})` : ""}` },
            { value: "history", label: "Order history" },
            { value: "fills", label: `Fills (${state.fills.length})` },
            ...(extraTab ? [{ value: "extra" as const, label: extraTab.label }] : []),
          ]}
        />
      </div>
      <div className="pb-2 pt-2">
        {tab === "positions" && <PositionsTable state={state} summary={summary} onClose={onClose} />}
        {tab === "orders" && <OpenOrdersTable state={state} onCancel={onCancel} />}
        {tab === "history" && <OrderHistoryTable state={state} />}
        {tab === "fills" && <FillsTable state={state} />}
        {tab === "extra" && extraTab?.node}
      </div>
    </div>
  );
}
