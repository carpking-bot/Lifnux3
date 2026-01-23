"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { CalendarGrid } from "./components/CalendarGrid";
import { Modal } from "../../(shared)/components/Modal";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { getDday, getMonthGrid } from "../../(shared)/lib/date";
import type { CalendarEvent, HolidayEvent, Label, ShoppingItem } from "../../(shared)/types/calendar";

const SCHEDULE_KEY = "lifnux.calendar.schedules.v100";
const HOLIDAY_KEY = "lifnux.calendar.holidays.v100";
const LABEL_KEY = "lifnux.calendar.labels.v100";
const SHOPPING_KEY = "lifnux.calendar.shopping.v100";

const statusData = {
  company: "Lifnux Labs",
  leaveHours: 72,
  tenure: "1y 3m",
  days: "D+463"
};

function matchesRepeat(event: CalendarEvent, dateKey: string) {
  if (!event.repeat) return false;
  const date = new Date(dateKey);
  const end = new Date(event.repeat.endDate);
  if (date > end) return false;
  const day = date.getDay();
  return event.repeat.daysOfWeek.includes(day);
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

const importanceRank: Record<ShoppingItem["importance"], number> = {
  HIGH: 3,
  MIDDLE: 2,
  LOW: 1
};

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadState(SCHEDULE_KEY, []));
  const [holidays, setHolidays] = useState<HolidayEvent[]>(() => loadState(HOLIDAY_KEY, []));
  const [labels, setLabels] = useState<Label[]>(() => loadState(LABEL_KEY, []));
  const [shopping, setShopping] = useState<ShoppingItem[]>(() => loadState(SHOPPING_KEY, []));
  const [shoppingModalOpen, setShoppingModalOpen] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [editingShopping, setEditingShopping] = useState<ShoppingItem | null>(null);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const days = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex]);
  const holidaySet = useMemo(() => {
    const set = holidayMap(year);
    holidays.forEach((holiday) => set.add(holiday.date));
    return set;
  }, [year, holidays]);

  useEffect(() => {
    const ym = searchParams.get("ym");
    if (!ym) return;
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return;
    setCursor(new Date(y, m - 1, 1));
  }, [searchParams]);

  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => ["HIGH", "CRITICAL"].includes(event.importance))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [events]);

  const sortedShopping = useMemo(() => {
    return [...shopping].sort((a, b) => importanceRank[b.importance] - importanceRank[a.importance]);
  }, [shopping]);

  const saveLabels = (next: Label[]) => {
    setLabels(next);
    saveState(LABEL_KEY, next);
  };

  const saveShopping = (next: ShoppingItem[]) => {
    setShopping(next);
    saveState(SHOPPING_KEY, next);
  };

  return (
    <AppShell title="Calendar v100">
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

          <CalendarGrid
            days={days}
            monthIndex={monthIndex}
            year={year}
            events={events}
            holidaySet={holidaySet}
            resolveEvents={(dateKey) => events.filter((event) => event.date === dateKey || matchesRepeat(event, dateKey))}
            onSelect={(dateKey) =>
              router.push(`/calendar/${dateKey}?returnYM=${year}-${String(monthIndex + 1).padStart(2, "0")}`)
            }
          />

          <div className="mt-8 lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Upcoming Events</div>
            <div className="mt-4 space-y-3">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div>{event.title}</div>
                    <div className="text-xs text-[var(--ink-1)]">{event.date}</div>
                  </div>
                  <div className="text-xs text-[var(--accent-1)]">{getDday(new Date(event.date))}</div>
                </div>
              ))}
              {upcomingEvents.length === 0 ? (
                <div className="text-sm text-[var(--ink-1)]">No upcoming high-priority events.</div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Shopping List</div>
              <button className="text-xs" onClick={() => setShoppingModalOpen(true)}>
                Add
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {sortedShopping.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <button
                    className="flex items-center gap-3"
                    onClick={() => {
                      setEditingShopping(item);
                      setShoppingModalOpen(true);
                    }}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.importance === "HIGH"
                          ? "bg-[var(--accent-2)]"
                          : item.importance === "MIDDLE"
                          ? "bg-[var(--accent-1)]"
                          : "bg-[var(--accent-3)]"
                      }`}
                    />
                    {item.name}
                  </button>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent-1)]"
                    onChange={() => saveShopping(shopping.filter((entry) => entry.id !== item.id))}
                  />
                </div>
              ))}
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
                    className="text-xs text-[var(--ink-1)]"
                    onClick={() => saveLabels(labels.filter((entry) => entry.id !== label.id))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {labels.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No labels.</div> : null}
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
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const nameInput = (document.getElementById("shopping-name") as HTMLInputElement).value;
                const importanceInput = (document.getElementById("shopping-importance") as HTMLSelectElement).value as
                  | "LOW"
                  | "MIDDLE"
                  | "HIGH";
                const memoInput = (document.getElementById("shopping-memo") as HTMLInputElement).value;
                if (!nameInput.trim()) return;
                const nextItem: ShoppingItem = {
                  id: editingShopping?.id ?? crypto.randomUUID(),
                  name: nameInput,
                  importance: importanceInput,
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
        <label className="block text-xs uppercase tracking-wide">
          Importance
          <select
            id="shopping-importance"
            defaultValue={editingShopping?.importance ?? "LOW"}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          >
            <option value="LOW">Low</option>
            <option value="MIDDLE">Middle</option>
            <option value="HIGH">High</option>
          </select>
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
    </AppShell>
  );
}
