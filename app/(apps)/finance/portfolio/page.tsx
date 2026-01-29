"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import type { BrokerAccount, Holding, Trade, WatchlistStock } from "../../../(shared)/types/finance";
import { loadFinanceState, saveAccounts, saveFinanceSettings, saveHoldings, saveTrades } from "../../../(shared)/lib/finance";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PortfolioPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [settings, setSettings] = useState({ blurSensitiveNumbers: true });
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Holding | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { accountId: string; stockId: string; avgPrice: string; qty: string }>>({});
  const [tradeForm, setTradeForm] = useState({
    accountId: "",
    stockId: "",
    side: "BUY" as "BUY" | "SELL",
    price: "",
    qty: ""
  });

  useEffect(() => {
    const data = loadFinanceState();
    setAccounts(data.accounts);
    setHoldings(data.holdings);
    setWatchlist(data.watchlist);
    setSettings(data.settings);
    setTrades(data.trades);
  }, []);

  useEffect(() => {
    if (accounts.length) saveAccounts(accounts);
  }, [accounts]);
  useEffect(() => {
    if (holdings.length) saveHoldings(holdings);
  }, [holdings]);
  useEffect(() => {
    saveFinanceSettings(settings);
  }, [settings]);
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  const heldStocks = useMemo(
    () => watchlist.filter((stock) => stock.watchlisted !== false && stock.isHeld),
    [watchlist]
  );
  const totalMarketValue = useMemo(() => {
    return holdings.reduce((sum, holding) => {
      const stock = heldStocks.find((item) => item.id === holding.stockId);
      if (!stock) return sum;
      return sum + stock.last * holding.qty;
    }, 0);
  }, [holdings, heldStocks]);

  const blurClass = settings.blurSensitiveNumbers ? "blur-sm select-none" : "";

  const formatNumber = (value: number, decimals: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatCurrency = (value: number, market?: "KR" | "US") => {
    const symbol = market === "KR" ? "₩" : "$";
    const decimals = market === "KR" ? 0 : 2;
    return `${symbol}${formatNumber(value, decimals)}`;
  };

  const parseNumber = (value: string) => {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const addHolding = () => {
    const firstAccount = accounts[0]?.id ?? "";
    const firstStock = heldStocks[0]?.id ?? "";
    if (!firstAccount || !firstStock) return;
    setHoldings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        accountId: firstAccount,
        stockId: firstStock,
        avgPrice: 0,
        qty: 0,
        currency: "USD"
      }
    ]);
  };

  const openTrade = () => {
    const firstAccount = accounts[0]?.id ?? "";
    const firstStock = heldStocks[0]?.id ?? "";
    setTradeForm({
      accountId: firstAccount,
      stockId: firstStock,
      side: "BUY",
      price: "",
      qty: ""
    });
    setTradeOpen(true);
  };

  const applyTrade = () => {
    const { accountId, stockId, side, price, qty } = tradeForm;
    const priceValue = Number(price);
    const qtyValue = Number(qty);
    if (!accountId || !stockId || !Number.isFinite(priceValue) || !Number.isFinite(qtyValue) || qtyValue <= 0) return;
    const existing = holdings.find((entry) => entry.accountId === accountId && entry.stockId === stockId);
    if (!existing && side === "SELL") return;

    const stock = heldStocks.find((item) => item.id === stockId);
    const currency = stock?.market === "KR" ? "KRW" : "USD";
    const nextHoldings = [...holdings];
    if (!existing && side === "BUY") {
      nextHoldings.push({
        id: crypto.randomUUID(),
        accountId,
        stockId,
        avgPrice: priceValue,
        qty: qtyValue,
        currency
      });
    } else if (existing) {
      const idx = nextHoldings.findIndex((entry) => entry.id === existing.id);
      if (idx >= 0) {
        const currentQty = existing.qty;
        const nextQty = side === "BUY" ? currentQty + qtyValue : currentQty - qtyValue;
        if (nextQty <= 0) {
          nextHoldings.splice(idx, 1);
        } else {
          const nextAvg =
            side === "BUY" ? (existing.avgPrice * currentQty + priceValue * qtyValue) / nextQty : existing.avgPrice;
          nextHoldings[idx] = { ...existing, qty: nextQty, avgPrice: nextAvg };
        }
      }
    }

    setHoldings(nextHoldings);
    setTrades((prev) => [
      ...prev,
      { id: crypto.randomUUID(), accountId, stockId, side, price: priceValue, qty: qtyValue, executedAt: Date.now() }
    ]);
    setTradeOpen(false);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]"
            onClick={() => router.back()}
          >
            Back
          </button>
          <div>
            <h1 className="text-3xl">Portfolio</h1>
            <div className="text-sm text-[var(--ink-1)]">Track holdings and broker allocation.</div>
          </div>
        </div>

        <div className="lifnux-glass rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Holdings</div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={openTrade}>
                Trade
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setAccountsOpen(true)}>
                Manage Accounts
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={addHolding}>
                Add Holding
              </button>
              <button
                className={`rounded-full border px-3 py-1 ${
                  settings.blurSensitiveNumbers ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10"
                }`}
                onClick={() =>
                  setSettings((prev) => ({ ...prev, blurSensitiveNumbers: !prev.blurSensitiveNumbers }))
                }
              >
                {settings.blurSensitiveNumbers ? "Reveal" : "Hide"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[980px] space-y-2 text-xs">
              <div className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1.2fr_0.8fr_0.7fr] gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
                <div>Account</div>
                <div>Stock</div>
                <div>Current / Value</div>
                <div>Avg / Cost</div>
                <div>Qty</div>
                <div>PnL</div>
                <div>Weight</div>
                <div>Today</div>
              </div>
              {holdings.map((holding) => {
                const account = accounts.find((acc) => acc.id === holding.accountId);
                const stock = heldStocks.find((item) => item.id === holding.stockId);
                const currentPrice = stock?.last ?? 0;
                const marketValue = currentPrice * holding.qty;
                const costBasis = holding.avgPrice * holding.qty;
                const pnlValue = marketValue - costBasis;
                const pnlPct = costBasis > 0 ? (pnlValue / costBasis) * 100 : 0;
                const weightPct = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;
                const market = stock?.market ?? (holding.currency === "KRW" ? "KR" : "US");
                const isEditing = editingId === holding.id;
                const draft = drafts[holding.id];
                return (
                  <div
                    key={holding.id}
                    className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1.2fr_0.8fr_0.7fr] gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div>
                      {isEditing ? (
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs"
                          value={draft?.accountId ?? holding.accountId}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty)
                                }),
                                accountId: event.target.value
                              }
                            }))
                          }
                        >
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.brokerName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-sm">{account?.brokerName ?? "-"}</div>
                      )}
                      <div className="mt-1 text-[10px] text-[var(--ink-1)]">{account?.countryType}</div>
                    </div>
                    <div>
                      {isEditing ? (
                        <select
                          className="w-full rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs"
                          value={draft?.stockId ?? holding.stockId}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty)
                                }),
                                stockId: event.target.value
                              }
                            }))
                          }
                        >
                          {heldStocks.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.ticker})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-sm">
                          {stock?.name ?? "-"}{" "}
                          <span className="text-[var(--ink-1)]">({stock?.ticker ?? "-"})</span>
                        </div>
                      )}
                    </div>
                    <div className={blurClass}>
                      <div>{formatCurrency(currentPrice, market)}</div>
                      <div className="text-[10px] text-[var(--ink-1)]">{formatCurrency(marketValue, market)}</div>
                    </div>
                    <div className={blurClass}>
                      {isEditing ? (
                        <div>
                          <input
                            className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                            value={draft?.avgPrice ?? String(holding.avgPrice)}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty)
                                  }),
                                  avgPrice: event.target.value
                                }
                              }))
                            }
                            onBlur={(event) => {
                              const normalized = formatNumber(parseNumber(event.target.value), market === "KR" ? 0 : 2);
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty)
                                  }),
                                  avgPrice: normalized
                                }
                              }));
                            }}
                          />
                        </div>
                      ) : (
                        <div>{formatCurrency(holding.avgPrice, market)}</div>
                      )}
                      <div className="text-[10px] text-[var(--ink-1)]">{formatCurrency(costBasis, market)}</div>
                    </div>
                    <div className={blurClass}>
                      {isEditing ? (
                        <input
                          className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                          value={draft?.qty ?? String(holding.qty)}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty)
                                }),
                                qty: event.target.value
                              }
                            }))
                          }
                          onBlur={(event) => {
                            const normalized = formatNumber(parseNumber(event.target.value), 0);
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty)
                                }),
                                qty: normalized
                              }
                            }));
                          }}
                        />
                      ) : (
                        <div>{formatNumber(holding.qty, 0)}</div>
                      )}
                    </div>
                    <div className={blurClass}>
                      <div className={pnlValue >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {pnlValue >= 0 ? "+" : ""}
                        {formatCurrency(Math.abs(pnlValue), market)}
                      </div>
                      <div className="text-[10px] text-[var(--ink-1)]">
                        {pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%
                      </div>
                    </div>
                    <div className={blurClass}>
                      {formatNumber(weightPct, 2)}%
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={stock?.changePct && stock.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {stock ? `${stock.changePct >= 0 ? "+" : ""}${stock.changePct.toFixed(2)}%` : "-"}
                      </span>
                      <button
                        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-1)]"
                        onClick={() => {
                          if (isEditing) return;
                          setEditingId(holding.id);
                          setDrafts((prev) => ({
                            ...prev,
                            [holding.id]: {
                              accountId: holding.accountId,
                              stockId: holding.stockId,
                              avgPrice: String(holding.avgPrice),
                              qty: String(holding.qty)
                            }
                          }));
                        }}
                        aria-label="Edit holding"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            className="text-[10px] text-emerald-300"
                            onClick={() => {
                              const nextDraft = drafts[holding.id];
                              if (!nextDraft) return;
                              const nextAvg = parseNumber(nextDraft.avgPrice);
                              const nextQty = parseNumber(nextDraft.qty);
                              setHoldings((prev) =>
                                prev.map((entry) =>
                                  entry.id === holding.id
                                    ? {
                                        ...entry,
                                        accountId: nextDraft.accountId,
                                        stockId: nextDraft.stockId,
                                        avgPrice: nextAvg,
                                        qty: nextQty
                                      }
                                    : entry
                                )
                              );
                              setEditingId(null);
                            }}
                            aria-label="Save holding"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            className="text-[10px] text-[var(--ink-1)]"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                      <button
                        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => {
                          setPendingDelete(holding);
                          setDeleteConfirmOpen(true);
                        }}
                        aria-label="Delete holding"
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
              {holdings.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No holdings yet.</div> : null}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={accountsOpen}
        title="Manage Accounts"
        onClose={() => setAccountsOpen(false)}
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setAccountsOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                  value={account.brokerName}
                  onChange={(event) =>
                    setAccounts((prev) =>
                      prev.map((entry) =>
                        entry.id === account.id ? { ...entry, brokerName: event.target.value } : entry
                      )
                    )
                  }
                />
                <select
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                  value={account.countryType}
                  onChange={(event) =>
                    setAccounts((prev) =>
                      prev.map((entry) =>
                        entry.id === account.id ? { ...entry, countryType: event.target.value as "KR" | "US" } : entry
                      )
                    )
                  }
                >
                  <option value="KR">KR</option>
                  <option value="US">US</option>
                </select>
              </div>
              <input
                className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                value={account.memo ?? ""}
                placeholder="Memo"
                onChange={(event) =>
                  setAccounts((prev) =>
                    prev.map((entry) => (entry.id === account.id ? { ...entry, memo: event.target.value } : entry))
                  )
                }
              />
              <div className="mt-2 text-right">
                <button
                  className="text-xs text-[var(--ink-1)]"
                  onClick={() => setAccounts((prev) => prev.filter((entry) => entry.id !== account.id))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--ink-1)]"
            onClick={() =>
              setAccounts((prev) => [
                ...prev,
                { id: crypto.randomUUID(), brokerName: "New Broker", countryType: "KR", memo: "" }
              ])
            }
          >
            Add Account
          </button>
        </div>
      </Modal>

      <Modal
        open={tradeOpen}
        title="Trade"
        onClose={() => setTradeOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setTradeOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={applyTrade}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block text-xs uppercase tracking-wide">
            Account
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={tradeForm.accountId}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, accountId: event.target.value }))}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.brokerName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Stock
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={tradeForm.stockId}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, stockId: event.target.value }))}
            >
              {heldStocks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.ticker})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Side
            <div className="mt-1 flex gap-2">
              {(["BUY", "SELL"] as const).map((side) => (
                <button
                  key={side}
                  className={`rounded-full border px-4 py-2 text-xs ${
                    tradeForm.side === side ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10"
                  }`}
                  onClick={() => setTradeForm((prev) => ({ ...prev, side }))}
                  type="button"
                >
                  {side}
                </button>
              ))}
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Price
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              type="number"
              value={tradeForm.price}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, price: event.target.value }))}
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Quantity
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              type="number"
              value={tradeForm.qty}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, qty: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete Holding"
        description="이 보유 종목을 삭제할까요?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) {
            setHoldings((prev) => prev.filter((entry) => entry.id !== pendingDelete.id));
          }
          setPendingDelete(null);
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteConfirmOpen(false);
        }}
      />
    </AppShell>
  );
}
