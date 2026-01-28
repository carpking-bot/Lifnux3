"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { CalendarGrid } from "./components/CalendarGrid";
import { Modal } from "../../(shared)/components/Modal";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { formatDateKey, getDday, getMonthGrid, parseDateKey } from "../../(shared)/lib/date";
import { formatPrice, sortShoppingItems } from "../../(shared)/lib/shopping";
import type { CalendarEvent, HolidayEvent, Label, RecurringRule, ShoppingItem } from "../../(shared)/types/calendar";
import { EventEditor } from "./components/EventEditor";

const SCHEDULE_KEY = "lifnux.calendar.schedules.v100";
const HOLIDAY_KEY = "lifnux.calendar.holidays.v100";
const LABEL_KEY = "lifnux.calendar.labels.v100";
const SHOPPING_KEY = "lifnux.calendar.shopping.v100";
const RECURRING_KEY = "lifnux.calendar.recurring.v100";

const statusData = {
  company: "Lifnux Labs",
  leaveHours: 72,
  tenure: "1y 3m",
  days: "D+463"
};

function matchesRecurring(rule: RecurringRule, dateKey: string, holidayDates: Set<string>) {
  const date = new Date(dateKey);
  const start = new Date(rule.startDate);
  if (date < start) return false;
  if (rule.endDate) {
    const end = new Date(rule.endDate);
    if (date > end) return false;
  }
  if (rule.excludeHolidays && holidayDates.has(dateKey)) return false;
  if (rule.exclusions?.includes(dateKey)) return false;
  const day = date.getDay();
  return rule.daysOfWeek.includes(day);
}

function buildEventFromRule(rule: RecurringRule, dateKey: string): CalendarEvent {
  return {
    id: `${rule.id}:${dateKey}`,
    recurringRuleId: rule.id,
    title: rule.title,
    date: dateKey,
    type: rule.type,
    startTime: rule.startTime,
    endTime: rule.endTime,
    importance: rule.importance,
    labelId: rule.labelId,
    location: rule.location,
    memo: rule.memo
  };
}

function migrateRepeatEvents(events: CalendarEvent[], rules: RecurringRule[]) {
  let changed = false;
  const nextRules = [...rules];
  const nextEvents = events.map((event) => {
    if (!event.repeat) return event;
    const ruleId = crypto.randomUUID();
    nextRules.push({
      id: ruleId,
      title: event.title,
      type: event.type,
      startDate: event.date,
      daysOfWeek: event.repeat.daysOfWeek,
      endDate: event.repeat.endDate || undefined,
      excludeHolidays: event.repeat.excludeHolidays ?? false,
      startTime: event.startTime,
      endTime: event.endTime,
      importance: event.importance,
      labelId: event.labelId,
      location: event.location,
      memo: event.memo,
      exclusions: [],
      createdAt: Date.now()
    });
    changed = true;
    const { repeat, ...rest } = event;
    return { ...rest, recurringRuleId: ruleId };
  });
  return { events: nextEvents, rules: nextRules, changed };
}

const holidayMap = (year: number) =>
  new Set(
    [
      `${year}-01-01`,
      `${year}-03-01`,
      `${year}-05-05`,
      `${year}-06-06`,
      `${year}-08-15`,
      `${year}-10-03`,
      `${year}-10-09`,
      `${year}-12-25`
    ].map((value) => value)
  );

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<HolidayEvent[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [shoppingModalOpen, setShoppingModalOpen] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingShopping, setEditingShopping] = useState<ShoppingItem | null>(null);
  const [shoppingPriceInput, setShoppingPriceInput] = useState("");
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringRule | null>(null);
  const [infoEvent, setInfoEvent] = useState<CalendarEvent | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const days = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex]);
  const holidaySet = useMemo(() => {
    const set = holidayMap(year);
    holidays.forEach((holiday) => set.add(holiday.date));
    return set;
  }, [year, holidays]);
  const holidayTitles = useMemo(() => {
    const map: Record<string, string[]> = {};
    holidays.forEach((holiday) => {
      if (!map[holiday.date]) map[holiday.date] = [];
      map[holiday.date].push(holiday.title);
    });
    return map;
  }, [holidays]);
  const holidayDates = useMemo(() => new Set(holidays.map((holiday) => holiday.date)), [holidays]);

  useEffect(() => {
    const loadedEvents = loadState(SCHEDULE_KEY, []);
    const loadedRules = loadState(RECURRING_KEY, []);
    const migrated = migrateRepeatEvents(loadedEvents, loadedRules);
    setEvents(migrated.events);
    setRecurringRules(migrated.rules);
    if (migrated.changed) {
      saveState(SCHEDULE_KEY, migrated.events);
      saveState(RECURRING_KEY, migrated.rules);
    }
    setHolidays(loadState(HOLIDAY_KEY, []));
    setLabels(loadState(LABEL_KEY, []));
    setShopping(loadState(SHOPPING_KEY, []));
    const ym = searchParams.get("ym");
    if (!ym) return;
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return;
    setCursor(new Date(y, m - 1, 1));
  }, [searchParams]);

  useEffect(() => {
    if (!shoppingModalOpen) return;
    if (typeof editingShopping?.price === "number") {
      setShoppingPriceInput(editingShopping.price.toLocaleString("ko-KR"));
      return;
    }
    setShoppingPriceInput("");
  }, [shoppingModalOpen, editingShopping]);

  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => ["HIGH", "CRITICAL"].includes(event.importance))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events]);

  const sortedShopping = useMemo(() => {
    return sortShoppingItems(shopping);
  }, [shopping]);
  const recurringEvents = useMemo(() => recurringRules, [recurringRules]);

  const saveLabels = (next: Label[]) => {
    setLabels(next);
    saveState(LABEL_KEY, next);
  };

  const saveEvents = (next: CalendarEvent[]) => {
    setEvents(next);
    saveState(SCHEDULE_KEY, next);
  };

  const saveRecurringRules = (next: RecurringRule[]) => {
    setRecurringRules(next);
    saveState(RECURRING_KEY, next);
  };

  const saveShopping = (next: ShoppingItem[]) => {
    setShopping(next);
    saveState(SHOPPING_KEY, next);
  };

  const formatRepeatDays = (days: number[]) => {
    const map: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
    const order = [1, 2, 3, 4, 5, 6, 0];
    const unique = Array.from(new Set(days));
    return order.filter((day) => unique.includes(day)).map((day) => map[day]).join("/");
  };

  const resolveLabel = (labelId?: string) => labels.find((label) => label.id === labelId);

  const resolveEventsForDate = (dateKey: string) => {
    const dayEvents = events.filter((event) => event.date === dateKey);
    const overrideMap = new Set(dayEvents.filter((event) => event.recurringRuleId).map((event) => event.recurringRuleId));
    const generated = recurringRules
      .filter((rule) => matchesRecurring(rule, dateKey, holidayDates))
      .filter((rule) => !overrideMap.has(rule.id))
      .map((rule) => buildEventFromRule(rule, dateKey));
    return [...dayEvents, ...generated];
  };

  const openDeleteConfirm = (title: string, message: string, action: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };
  const closeDeleteConfirm = () => {
    setConfirmOpen(false);
    setConfirmAction(null);
    setConfirmTitle("");
    setConfirmMessage("");
  };
  const handleDeleteConfirm = () => {
    if (confirmAction) confirmAction();
    closeDeleteConfirm();
  };

  return (
    <AppShell title="">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex items-center justify-between text-sm text-[var(--ink-1)]">
            <div className="uppercase tracking-[0.3em]">Status</div>
            <div className="flex gap-6">
              <div>{statusData.company}</div>
              <div>Leave {statusData.leaveHours}h</div>
              <div>{statusData.tenure}</div>
              <div>{statusData.days}</div>
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="text-3xl">
                {cursor.toLocaleString("en-US", { month: "long" })} {year}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Calendar</div>
            </div>
            <div className="flex gap-2 text-sm">
              <button
                className="rounded-full border border-white/10 px-3 py-1"
                onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
              >
                Prev
              </button>
              <button
                className="rounded-full border border-white/10 px-3 py-1"
                onClick={() => setCursor(new Date())}
              >
                Today
              </button>
              <button
                className="rounded-full border border-white/10 px-3 py-1"
                onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="mb-6 lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Upcoming Events</div>
            <div className="mt-4 space-y-3">
              {upcomingEvents.map((event) => (
                <button
                  key={event.id}
                  className="flex w-full items-stretch gap-3 text-left text-sm"
                  onClick={() => setInfoEvent(event)}
                >
                  {(() => {
                    const daysLeft = getDaysUntil(event.date);
                    const isUrgent = daysLeft <= 3;
                    const isSoon = daysLeft >= 4 && daysLeft <= 7;
                    const barColor = isUrgent ? "#F43F5E" : isSoon ? "#FFB020" : "rgba(255,255,255,0.35)";
                    const dColor = isUrgent ? "text-rose-300" : isSoon ? "text-amber-200" : "text-[var(--ink-1)]";
                    return (
                      <>
                        <div
                          className={`w-[4px] rounded-full ${isUrgent ? "animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.45)]" : ""}`}
                          style={{ background: barColor }}
                        />
                        <div className="flex flex-1 items-center justify-between">
                          <div>
                            <div>{event.title}</div>
                            <div className="text-xs text-[var(--ink-1)]">{event.date}</div>
                          </div>
                          <div className={`text-xs ${dColor}`}>{getDday(new Date(event.date))}</div>
                        </div>
                      </>
                    );
                  })()}
                </button>
              ))}
              {upcomingEvents.length === 0 ? (
                <div className="text-sm text-[var(--ink-1)]">No upcoming high-priority events.</div>
              ) : null}
            </div>
          </div>

          <CalendarGrid
            days={days}
            monthIndex={monthIndex}
            year={year}
            events={events}
            holidaySet={holidaySet}
            holidayTitles={holidayTitles}
            labels={labels}
            resolveEvents={resolveEventsForDate}
            onEventClick={(event) => setInfoEvent(event)}
            onSelect={(dateKey) =>
              router.push(`/calendar/${dateKey}?returnYM=${year}-${String(monthIndex + 1).padStart(2, "0")}`)
            }
          />
        </div>

        <aside className="space-y-6">
          <div className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Shopping List</div>
              <button className="text-xs" onClick={() => setShoppingModalOpen(true)}>
                Add
              </button>
            </div>
            <div className="mt-4 space-y-3 text-[11px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
              <div className="grid grid-cols-[1.6fr_0.9fr] gap-2">
                <div>NAME</div>
                <div className="text-right">PRICE</div>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {sortedShopping.map((item) => {
                const priceLabel = formatPrice(item.price);
                const isHigh = item.importance === "HIGH";
                const barColor =
                  item.importance === "HIGH" ? "#FFB020" : item.importance === "MIDDLE" ? "#F97316" : "rgba(255,255,255,0.4)";
                return (
                  <div key={item.id} className="flex items-stretch gap-3 text-sm">
                    <div
                      className={`w-[4px] rounded-full ${isHigh ? "shadow-[0_0_12px_rgba(255,176,32,0.6)]" : ""}`}
                      style={{ background: barColor }}
                    />
                    <div className="grid flex-1 grid-cols-[1.6fr_0.9fr] items-start gap-2">
                      <button
                        className={`text-left ${isHigh ? "font-semibold text-[var(--ink-0)]" : ""}`}
                        onClick={() => {
                          setEditingShopping(item);
                          setShoppingModalOpen(true);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{item.name}</span>
                        </div>
                      </button>
                      <div className="flex items-center justify-end gap-2 text-xs text-[var(--ink-1)]">
                        <span>{priceLabel || "-"}</span>
                        <button
                          className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                          onClick={() => saveShopping(shopping.filter((entry) => entry.id !== item.id))}
                          aria-label="Remove shopping item"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {shopping.length === 0 ? (
                <div className="text-sm text-[var(--ink-1)]">No items yet.</div>
              ) : null}
            </div>
          </div>

          <div className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Labels</div>
              <button className="text-xs" onClick={() => setLabelModalOpen(true)}>
                Add
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2"
                    onClick={() => {
                      setEditingLabel(label);
                      setLabelModalOpen(true);
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: label.color }} />
                    {label.name}
                  </button>
                  <button
                    className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                    onClick={() => saveLabels(labels.filter((entry) => entry.id !== label.id))}
                  >
                    X
                  </button>
                </div>
              ))}
              {labels.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No labels.</div> : null}
            </div>
          </div>

          <div className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Recurring Schedules</div>
              <button
                className="text-xs"
                onClick={() => {
                  setEditingRecurring(null);
                  setRecurringModalOpen(true);
                }}
              >
                Add
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {recurringEvents.map((rule) => (
                <div
                  key={rule.id}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left"
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => {
                      setEditingRecurring(rule);
                      setRecurringModalOpen(true);
                    }}
                  >
                    <span>{rule.title}</span>
                    <span className="mt-1 block text-xs text-[var(--ink-1)]">
                      {formatRepeatDays(rule.daysOfWeek)} {rule.endDate ? `${rule.endDate} 까지` : "No end"}
                    </span>
                  </button>
                  <button
                    className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDeleteConfirm(
                        rule.title,
                        "반복 일정을 삭제하면 생성된 모든 일정이 함께 삭제됩니다. 삭제할까요?",
                        () => {
                          saveRecurringRules(recurringRules.filter((entry) => entry.id !== rule.id));
                          saveEvents(events.filter((entry) => entry.recurringRuleId !== rule.id));
                          setRecurringModalOpen(false);
                          setEditingRecurring(null);
                        }
                      );
                    }}
                    aria-label="Remove recurring schedule"
                  >
                    X
                  </button>
                </div>
              ))}
              {recurringEvents.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No recurring schedules.</div> : null}
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={shoppingModalOpen}
        title={editingShopping ? "Edit Shopping Item" : "Add Shopping Item"}
        onClose={() => {
          setShoppingModalOpen(false);
          setEditingShopping(null);
        }}
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setShoppingModalOpen(false);
                setEditingShopping(null);
              }}
            >
              Cancel
            </button>
            {editingShopping ? (
              <button
                className="rounded-full border border-white/10 px-4 py-2 text-xs text-[var(--accent-2)]"
                onClick={() => {
                  saveShopping(shopping.filter((entry) => entry.id !== editingShopping.id));
                  setShoppingModalOpen(false);
                  setEditingShopping(null);
                }}
              >
                Delete
              </button>
            ) : null}
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const nameInput = (document.getElementById("shopping-name") as HTMLInputElement).value;
                const importanceInput = (document.querySelector(
                  'input[name="shopping-importance"]:checked'
                ) as HTMLInputElement | null)?.value as "LOW" | "MIDDLE" | "HIGH" | undefined;
                const priceInput = shoppingPriceInput;
                const memoInput = (document.getElementById("shopping-memo") as HTMLInputElement).value;
                if (!nameInput.trim()) return;
                if (!importanceInput) return;
                const parsedPrice = priceInput.trim() ? Number(priceInput.replace(/,/g, "")) : undefined;
                const price = Number.isFinite(parsedPrice) ? parsedPrice : undefined;
                const nextItem: ShoppingItem = {
                  id: editingShopping?.id ?? crypto.randomUUID(),
                  name: nameInput,
                  importance: importanceInput,
                  price,
                  memo: memoInput
                };
                const next = editingShopping
                  ? shopping.map((item) => (item.id === editingShopping.id ? nextItem : item))
                  : [...shopping, nextItem];
                saveShopping(next);
                setShoppingModalOpen(false);
                setEditingShopping(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-xs uppercase tracking-wide">
          Name
          <input
            id="shopping-name"
            defaultValue={editingShopping?.name ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </label>
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide">Importance</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {([
              {
                value: "LOW",
                label: "Low",
                tone: "bg-slate-400/15 text-slate-200 peer-checked:bg-slate-200 peer-checked:text-black"
              },
              {
                value: "MIDDLE",
                label: "Middle",
                tone: "bg-amber-400/20 text-amber-100 peer-checked:bg-amber-400 peer-checked:text-black"
              },
              {
                value: "HIGH",
                label: "High",
                tone: "bg-rose-500/25 text-rose-100 peer-checked:bg-rose-500 peer-checked:text-white"
              }
            ] as const).map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="shopping-importance"
                  value={option.value}
                  defaultChecked={(editingShopping?.importance ?? "LOW") === option.value}
                />
                <span
                  className={`block rounded-full border border-white/10 px-3 py-2 text-center uppercase tracking-[0.2em] transition hover:border-white/30 ${option.tone} peer-checked:border-white/60`}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="block text-xs uppercase tracking-wide">
          Price
          <input
            id="shopping-price"
            type="text"
            inputMode="numeric"
            value={shoppingPriceInput}
            onChange={(event) => setShoppingPriceInput(formatPriceInput(event.target.value))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            placeholder="1349999"
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Memo
          <input
            id="shopping-memo"
            defaultValue={editingShopping?.memo ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </label>
      </Modal>

      <Modal
        open={labelModalOpen}
        title={editingLabel ? "Edit Label" : "Add Label"}
        onClose={() => {
          setLabelModalOpen(false);
          setEditingLabel(null);
        }}
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setLabelModalOpen(false);
                setEditingLabel(null);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const nameInput = (document.getElementById("label-name") as HTMLInputElement).value;
                const colorInput = (document.getElementById("label-color") as HTMLInputElement).value;
                if (!nameInput.trim()) return;
                const nextLabel: Label = {
                  id: editingLabel?.id ?? crypto.randomUUID(),
                  name: nameInput,
                  color: colorInput || "#5ad6d0"
                };
                const next = editingLabel
                  ? labels.map((item) => (item.id === editingLabel.id ? nextLabel : item))
                  : [...labels, nextLabel];
                saveLabels(next);
                setLabelModalOpen(false);
                setEditingLabel(null);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-xs uppercase tracking-wide">
          Name
          <input
            id="label-name"
            defaultValue={editingLabel?.name ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Color
          <input
            id="label-color"
            type="color"
            defaultValue={editingLabel?.color ?? "#5ad6d0"}
            className="mt-1 h-10 w-20 rounded-lg border border-white/10 bg-black/20"
          />
        </label>
      </Modal>

      <Modal
        open={recurringModalOpen}
        title={editingRecurring ? "Edit Recurring Schedule" : "Add Recurring Schedule"}
        onClose={() => {
          setRecurringModalOpen(false);
          setEditingRecurring(null);
        }}
      >
        <EventEditor
          mode="rule"
          initialRule={editingRecurring ?? undefined}
          date={editingRecurring?.startDate ?? formatDateKey(new Date())}
          labels={labels}
          defaultType={editingRecurring?.type ?? "TIMED"}
          onSaveSchedule={() => undefined}
          onSaveRecurring={(rule) => {
            const existing = recurringRules.find((entry) => entry.id === rule.id);
            const nextRule = { ...rule, excludeHolidays: rule.excludeHolidays ?? false };
            const next = existing
              ? recurringRules.map((entry) => (entry.id === rule.id ? nextRule : entry))
              : [...recurringRules, nextRule];
            saveRecurringRules(next);
            setRecurringModalOpen(false);
            setEditingRecurring(null);
          }}
          onSaveHoliday={() => undefined}
          hideHolidayToggle
          onDelete={
            editingRecurring
              ? () => {
                  openDeleteConfirm(
                    editingRecurring.title,
                    "반복 일정을 삭제하면 생성된 모든 일정이 함께 삭제됩니다. 삭제할까요?",
                    () => {
                      saveRecurringRules(recurringRules.filter((entry) => entry.id !== editingRecurring.id));
                      saveEvents(events.filter((entry) => entry.recurringRuleId !== editingRecurring.id));
                      setRecurringModalOpen(false);
                      setEditingRecurring(null);
                    }
                  );
                }
              : undefined
          }
        />
      </Modal>

      <Modal
        open={!!infoEvent}
        title={infoEvent?.title ?? "Schedule"}
        onClose={() => setInfoEvent(null)}
        closeOnBackdrop
        closeOnEsc
      >
        {infoEvent ? (
          <div className="space-y-3 text-sm text-[var(--ink-1)]">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Type</div>
                <div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase">
                    {infoEvent.type === "TIMED" ? "Timed" : "Date"}
                  </span>
                </div>
                {infoEvent.startTime ? (
                  <>
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Time</div>
                    <div>
                      {infoEvent.startTime} - {infoEvent.endTime}
                    </div>
                  </>
                ) : null}
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Importance</div>
                <div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase">
                    {infoEvent.importance}
                  </span>
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Label</div>
                <div>
                  {(() => {
                    const label = resolveLabel(infoEvent.labelId);
                    return label ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase">
                        <span className="h-2 w-2 rounded-full" style={{ background: label.color }} />
                        {label.name}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase">None</span>
                    );
                  })()}
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Location</div>
                <div>{infoEvent.location || "-"}</div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Memo</div>
                <div>{infoEvent.memo || "-"}</div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        title="반복 일정 삭제"
        description={confirmMessage}
        detail={confirmTitle}
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={closeDeleteConfirm}
      />
    </AppShell>
  );
}

function formatPriceInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  const normalized = Number(digits);
  if (!Number.isFinite(normalized)) return "";
  return normalized.toLocaleString("ko-KR");
}

function getDaysUntil(dateKey: string) {
  const start = new Date();
  const today = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const target = parseDateKey(dateKey);
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}











