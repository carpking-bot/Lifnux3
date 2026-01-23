"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { EventEditor } from "../components/EventEditor";
import { loadState, saveState } from "../../../(shared)/lib/storage";
import { parseDateKey, timeSlots } from "../../../(shared)/lib/date";
import type { CalendarEvent, HolidayEvent, Label } from "../../../(shared)/types/calendar";
import { CalendarDays, Plus } from "lucide-react";

const SCHEDULE_KEY = "lifnux.calendar.schedules.v100";
const HOLIDAY_KEY = "lifnux.calendar.holidays.v100";
const LABEL_KEY = "lifnux.calendar.labels.v100";

function matchesRepeat(event: CalendarEvent, dateKey: string) {
  if (!event.repeat) return false;
  const date = parseDateKey(dateKey);
  const end = parseDateKey(event.repeat.endDate);
  if (date > end) return false;
  const day = date.getDay();
  return event.repeat.daysOfWeek.includes(day);
}

export default function SchedulerPage({ params }: { params: { date: string } }) {
  const router = useRouter();
  const dateKey = params.date;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [holidays, setHolidays] = useState<HolidayEvent[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewEvent, setViewEvent] = useState<CalendarEvent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [defaultStartTime, setDefaultStartTime] = useState<string | undefined>(undefined);
  const [defaultEndTime, setDefaultEndTime] = useState<string | undefined>(undefined);
  const [defaultType, setDefaultType] = useState<CalendarEvent["type"] | undefined>(undefined);

  useEffect(() => {
    setEvents(loadState(SCHEDULE_KEY, []));
    setHolidays(loadState(HOLIDAY_KEY, []));
    setLabels(loadState(LABEL_KEY, []));
  }, []);

  const eventsForDay = useMemo(() => {
    return events.filter((event) => event.date === dateKey || matchesRepeat(event, dateKey));
  }, [events, dateKey]);

  const slots = useMemo(() => timeSlots(), []);

  const saveEvents = (next: CalendarEvent[]) => {
    setEvents(next);
    saveState(SCHEDULE_KEY, next);
  };

  const saveHolidays = (next: HolidayEvent[]) => {
    setHolidays(next);
    saveState(HOLIDAY_KEY, next);
  };

  const saveEvent = (event: CalendarEvent) => {
    const existing = events.find((entry) => entry.id === event.id);
    const next = existing
      ? events.map((entry) => (entry.id === event.id ? event : entry))
      : [...events, event];
    saveEvents(next);
    setEditorOpen(false);
    setEditMode(false);
    setViewEvent(null);
  };

  const saveHoliday = (holiday: HolidayEvent) => {
    const existing = holidays.find((entry) => entry.id === holiday.id);
    const next = existing
      ? holidays.map((entry) => (entry.id === holiday.id ? holiday : entry))
      : [...holidays, holiday];
    saveHolidays(next);
    setEditorOpen(false);
    setEditMode(false);
    setViewEvent(null);
  };

  const nextSlotTime = (slot: string) => {
    const [h, m] = slot.split(":").map(Number);
    const total = h * 60 + m + 30;
    const nextH = Math.floor(total / 60) % 24;
    const nextM = total % 60;
    return `${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`;
  };

  return (
    <AppShell showTitle={false}>
      <div className="mb-6 flex flex-col items-center gap-5">
        <div className="w-full max-w-[680px]">
          <div className="flex items-center justify-end gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-[var(--ink-1)]">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                const returnYM = params.get("returnYM");
                router.push(returnYM ? `/calendar?ym=${returnYM}` : "/calendar");
              }}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-1)] text-black"
              onClick={() => {
                setDefaultStartTime(undefined);
                setDefaultEndTime(undefined);
                setDefaultType("TIMED");
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          role="button"
          tabIndex={0}
          className="w-full max-w-[780px] lifnux-glass rounded-2xl p-5 text-left transition hover:scale-[1.01]"
          onClick={() => {
            setDefaultStartTime(undefined);
            setDefaultEndTime(undefined);
            setDefaultType("DATE");
            setEditorOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              setDefaultStartTime(undefined);
              setDefaultEndTime(undefined);
              setDefaultType("DATE");
              setEditorOpen(true);
            }
          }}
        >
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">All-day / Date Schedule</div>
          <div className="mt-3 space-y-3">
            {eventsForDay
              .filter((event) => event.type === "DATE")
              .map((event) => (
                <button
                  key={event.id}
                  className="block text-left text-sm"
                  onClick={(eventClick) => {
                    eventClick.stopPropagation();
                    setViewEvent(event);
                    setEditMode(false);
                  }}
                >
                  {event.title}
                </button>
              ))}
            {eventsForDay.filter((event) => event.type === "DATE").length === 0 ? (
              <div className="text-sm text-[var(--ink-1)]">No date schedules.</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-[680px]">
          <div className="grid grid-cols-[80px_1fr] gap-4">
            <div className="space-y-0 text-xs text-[var(--ink-1)]">
              {slots.map((slot) => (
                <div key={slot} className="h-[48px] flex items-start pt-2">
                  {slot}
                </div>
              ))}
            </div>
            <div className="relative">
              {slots.map((slot) => (
                <div
                  key={slot}
                  className="h-[48px] border-b border-white/5"
                  onClick={() => {
                    setDefaultStartTime(slot);
                    setDefaultEndTime(nextSlotTime(slot));
                    setDefaultType("TIMED");
                    setEditorOpen(true);
                  }}
                />
              ))}
              {eventsForDay
                .filter((event) => event.type === "TIMED")
                .map((event) => {
                  if (!event.startTime || !event.endTime) return null;
                  const [startH, startM] = event.startTime.split(":").map(Number);
                  const [endH, endM] = event.endTime.split(":").map(Number);
                  const startMinutes = startH * 60 + startM;
                  const endMinutesRaw = endH * 60 + endM;
                  const endMinutes = endMinutesRaw <= startMinutes ? endMinutesRaw + 1440 : endMinutesRaw;
                  const dayStart = 7 * 60;
                  const dayEnd = 30 * 60;
                  const pxPerMinute = 48 / 30;
                  const clampedStart = Math.max(startMinutes, dayStart);
                  const clampedEnd = Math.min(endMinutes, dayEnd);
                  const top = (clampedStart - dayStart) * pxPerMinute;
                  const height = Math.max((clampedEnd - clampedStart) * pxPerMinute, 24);
                  const labelColor = labels.find((label) => label.id === event.labelId)?.color ?? "#2a3d4c";
                  return (
                    <button
                      key={event.id}
                      className="absolute left-0 right-0 flex items-center justify-center rounded-xl border border-white/10 text-sm"
                      style={{
                        top,
                        height,
                        background: `${labelColor}33`,
                        boxShadow: `0 0 24px ${labelColor}55`,
                        borderColor: `${labelColor}88`
                      }}
                      onClick={() => {
                        setViewEvent(event);
                        setEditMode(false);
                      }}
                    >
                      <span className="px-3 text-center">{event.title}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Add Schedule"
        onClose={() => {
          setEditorOpen(false);
          setDefaultStartTime(undefined);
          setDefaultEndTime(undefined);
          setDefaultType(undefined);
        }}
      >
        <EventEditor
          date={dateKey}
          labels={labels}
          defaultStartTime={defaultStartTime}
          defaultEndTime={defaultEndTime}
          defaultType={defaultType}
          onSaveSchedule={saveEvent}
          onSaveHoliday={saveHoliday}
        />
      </Modal>

      <Modal
        open={!!viewEvent}
        title={viewEvent?.title ?? "Event"}
        onClose={() => {
          setViewEvent(null);
          setEditMode(false);
        }}
        actions={
          viewEvent && !editMode ? (
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => setEditMode(true)}
            >
              Edit
            </button>
          ) : undefined
        }
      >
        {viewEvent && !editMode ? (
          <div className="space-y-2 text-sm text-[var(--ink-1)]">
            <div>Type: {viewEvent.type}</div>
            {viewEvent.startTime ? (
              <div>
                Time: {viewEvent.startTime} - {viewEvent.endTime}
              </div>
            ) : null}
            <div>Importance: {viewEvent.importance}</div>
            <div>Location: {viewEvent.location || "-"}</div>
            <div>Memo: {viewEvent.memo || "-"}</div>
            <div>Holiday Style: {viewEvent.isHoliday ? "Yes" : "No"}</div>
          </div>
        ) : null}
        {viewEvent && editMode ? (
          <EventEditor
            date={dateKey}
            labels={labels}
            initial={viewEvent}
            onSaveSchedule={saveEvent}
            onSaveHoliday={saveHoliday}
          />
        ) : null}
      </Modal>
    </AppShell>
  );
}
