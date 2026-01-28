"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateKey, getMonthGrid, parseDateKey } from "../../../(shared)/lib/date";
import { CalendarEvent, HolidayEvent, Importance, Label, RecurringRule } from "../../../(shared)/types/calendar";

const importanceOptions: Importance[] = ["LOW", "MIDDLE", "HIGH", "CRITICAL"];

export function EventEditor({
  date,
  labels,
  initial,
  initialHoliday,
  initialRule,
  defaultStartTime,
  defaultEndTime,
  defaultType,
  defaultRepeatEnabled,
  defaultRepeatDays,
  defaultRepeatEnd,
  mode = "event",
  onSaveSchedule,
  onSaveRecurring,
  onSaveHoliday,
  onDelete,
  hideHolidayToggle
}: {
  date: string;
  labels: Label[];
  initial?: CalendarEvent;
  initialHoliday?: HolidayEvent;
  initialRule?: RecurringRule;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultType?: CalendarEvent["type"];
  defaultRepeatEnabled?: boolean;
  defaultRepeatDays?: number[];
  defaultRepeatEnd?: string;
  mode?: "event" | "rule";
  onSaveSchedule: (event: CalendarEvent) => void;
  onSaveRecurring?: (rule: RecurringRule) => void;
  onSaveHoliday: (event: HolidayEvent) => void;
  onDelete?: () => void;
  hideHolidayToggle?: boolean;
}) {
  const isRuleMode = mode === "rule";
  const isHolidayMode = !!initialHoliday;
  const [title, setTitle] = useState(initialHoliday?.title ?? initialRule?.title ?? initial?.title ?? "");
  const [type, setType] = useState<CalendarEvent["type"]>(initialRule?.type ?? initial?.type ?? defaultType ?? "TIMED");
  const [startTime, setStartTime] = useState(initialRule?.startTime ?? initial?.startTime ?? defaultStartTime ?? "07:00");
  const [endTime, setEndTime] = useState(initialRule?.endTime ?? initial?.endTime ?? defaultEndTime ?? "08:00");
  const [importance, setImportance] = useState<Importance>(initialRule?.importance ?? initial?.importance ?? "LOW");
  const [labelId, setLabelId] = useState(initialHoliday?.labelId ?? initialRule?.labelId ?? initial?.labelId ?? "");
  const [location, setLocation] = useState(initialRule?.location ?? initial?.location ?? "");
  const [memo, setMemo] = useState(initialHoliday?.memo ?? initialRule?.memo ?? initial?.memo ?? "");
  const [repeatDays, setRepeatDays] = useState<number[]>(
    initialRule?.daysOfWeek ?? initial?.repeat?.daysOfWeek ?? defaultRepeatDays ?? []
  );
  const [repeatEnd, setRepeatEnd] = useState(initialRule?.endDate ?? initial?.repeat?.endDate ?? defaultRepeatEnd ?? "");
  const [repeatNoEnd, setRepeatNoEnd] = useState(
    !!initialRule ? !initialRule.endDate : !!initial?.repeat && !initial?.repeat?.endDate
  );
  const [excludeHolidays, setExcludeHolidays] = useState(
    initialRule?.excludeHolidays ?? initial?.repeat?.excludeHolidays ?? false
  );
  const [repeatEndError, setRepeatEndError] = useState("");
  const [isHoliday, setIsHoliday] = useState(!!initialHoliday);
  const [repeatEnabled, setRepeatEnabled] = useState(
    isRuleMode ? true : typeof defaultRepeatEnabled === "boolean" ? defaultRepeatEnabled : !!initial?.repeat
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const calendarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!calendarRef.current) return;
      if (!calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [calendarOpen]);

  useEffect(() => {
    if (!repeatEnabled || repeatNoEnd) {
      setRepeatEndError("");
      return;
    }
    if (!repeatEnd) {
      setRepeatEndError("End date is required.");
      return;
    }
    if (!isValidDate(repeatEnd)) {
      setRepeatEndError("Invalid date.");
      return;
    }
    setRepeatEndError("");
  }, [repeatEnabled, repeatNoEnd, repeatEnd]);

  const calendarDays = useMemo(() => {
    return getMonthGrid(calendarCursor.getFullYear(), calendarCursor.getMonth());
  }, [calendarCursor]);

  const toggleDay = (day: number) => {
    setRepeatDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const openCalendar = () => {
    const baseDate = isValidDate(repeatEnd) ? parseDateKey(repeatEnd) : new Date();
    setCalendarCursor(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    setCalendarOpen(true);
  };

  return (
    <div className="space-y-4">
      <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
        Title
        <input
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {!isHolidayMode ? (
        <>
          <div className={`grid grid-cols-2 gap-3 ${isHoliday ? "opacity-50" : ""}`}>
            <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Type
              <select
                className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as CalendarEvent["type"])}
                disabled={isHoliday}
              >
                <option value="TIMED">Timed Schedule</option>
                <option value="DATE">Date Schedule</option>
              </select>
            </label>
            <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Importance
              <select
                className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={importance}
                onChange={(event) => setImportance(event.target.value as Importance)}
                disabled={isHoliday}
              >
                {importanceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {type === "TIMED" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
                Start
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={isHoliday}
                />
              </label>
              <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
                End
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  disabled={isHoliday}
                />
              </label>
            </div>
          ) : null}
        </>
      ) : null}
      <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
        Label
        <select
          className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          value={labelId}
          onChange={(event) => setLabelId(event.target.value)}
          disabled={!isHolidayMode && isHoliday}
        >
          <option value="">None</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
      {!isHolidayMode ? (
        <div className={`grid grid-cols-2 gap-3 ${isHoliday ? "opacity-50" : ""}`}>
          <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
            Location
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              disabled={isHoliday}
            />
          </label>
          <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
            Memo
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              disabled={isHoliday}
            />
          </label>
        </div>
      ) : (
        <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
          Memo
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
          />
        </label>
      )}
      {!isHolidayMode ? (
        <div className={`space-y-2 ${isHoliday ? "opacity-50" : ""}`}>
          {!isRuleMode ? (
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--ink-1)]">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRepeatEnabled(checked);
                  if (!checked) {
                    setRepeatDays([]);
                    setRepeatEnd("");
                    setRepeatNoEnd(false);
                  }
                }}
                disabled={isHoliday}
              />
              Repeat
            </label>
          ) : null}
          {repeatEnabled ? (
            <>
              <div className="text-xs uppercase tracking-wide text-[var(--ink-1)]">Repeat (Mon-Sun)</div>
              <div className="grid grid-cols-7 gap-2 text-xs">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
                  const jsDay = (index + 1) % 7;
                  return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(jsDay)}
                    className={`rounded-lg px-2 py-1 ${
                      repeatDays.includes(jsDay) ? "bg-white/20" : "bg-black/30"
                    }`}
                  >
                    {label}
                  </button>
                );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--ink-1)]">
                <input
                  type="checkbox"
                  checked={excludeHolidays}
                  onChange={(event) => setExcludeHolidays(event.target.checked)}
                />
                Exclude holidays
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--ink-1)]">
                  <input
                    type="checkbox"
                    checked={repeatNoEnd}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setRepeatNoEnd(checked);
                      if (checked) {
                        setRepeatEnd("");
                        setCalendarOpen(false);
                      }
                    }}
                  />
                  No end
                </label>
                {!repeatNoEnd ? (
                  <div ref={calendarRef} className="relative">
                    <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
                      Repeat End Date
                      <input
                        className={`mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm ${
                          repeatEndError ? "border-[var(--accent-2)]" : ""
                        }`}
                        value={repeatEnd}
                        onChange={(event) => setRepeatEnd(formatDateInput(event.target.value))}
                        onFocus={openCalendar}
                        onClick={openCalendar}
                        placeholder="YYYY-MM-DD"
                      />
                    </label>
                    {repeatEndError ? <div className="text-xs text-[var(--accent-2)]">{repeatEndError}</div> : null}
                    {calendarOpen ? (
                      <div className="absolute z-10 mt-2 w-[260px] rounded-xl border border-white/10 bg-black/80 p-3 text-xs shadow-xl">
                        <div className="mb-2 flex items-center justify-between">
                          <button
                            type="button"
                            className="rounded-lg border border-white/10 px-2 py-1"
                            onClick={() =>
                              setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                            }
                          >
                            Prev
                          </button>
                          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
                            {calendarCursor.toLocaleString("en-US", { month: "short" })} {calendarCursor.getFullYear()}
                          </div>
                          <button
                            type="button"
                            className="rounded-lg border border-white/10 px-2 py-1"
                            onClick={() =>
                              setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                            }
                          >
                            Next
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-[10px] text-[var(--ink-1)]">
                          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                            <div key={label} className="text-center">
                              {label}
                            </div>
                          ))}
                          {calendarDays.map((day) => {
                            const key = formatDateKey(day);
                            const isCurrentMonth =
                              day.getFullYear() === calendarCursor.getFullYear() && day.getMonth() === calendarCursor.getMonth();
                            const isSelected = repeatEnd === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                className={`rounded-md px-1 py-1 text-center ${
                                  isSelected ? "bg-[var(--accent-1)] text-black" : isCurrentMonth ? "text-[var(--ink-0)]" : "text-[var(--ink-1)]/50"
                                }`}
                                onClick={() => {
                                  setRepeatEnd(formatDateKey(day));
                                  setCalendarOpen(false);
                                }}
                              >
                                {day.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {!hideHolidayToggle ? (
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--ink-1)]">
          <input
            type="checkbox"
            checked={isHoliday}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsHoliday(checked);
              if (checked) {
                setRepeatEnabled(false);
                setRepeatDays([]);
                setRepeatEnd("");
                setRepeatNoEnd(false);
              }
            }}
          />
          AS A HOLIDAY
        </label>
      ) : null}
      <div className="flex items-center justify-between">
        {onDelete ? (
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-xs"
            onClick={() => {
              onDelete();
            }}
          >
            Delete
          </button>
        ) : (
          <div />
        )}
        <button
          className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-black"
          onClick={() => {
            if (repeatEnabled && !repeatNoEnd && repeatEndError) return;
            if (repeatEnabled && !repeatNoEnd && !repeatEnd) return;
            if (isRuleMode && onSaveRecurring) {
              onSaveRecurring({
                id: initialRule?.id ?? crypto.randomUUID(),
                title: title || "Untitled",
                type,
                startDate: date,
                daysOfWeek: repeatDays,
                endDate: repeatNoEnd ? undefined : repeatEnd,
                excludeHolidays,
                startTime: type === "TIMED" ? startTime : undefined,
                endTime: type === "TIMED" ? endTime : undefined,
                importance,
                labelId: labelId || undefined,
                location,
                memo,
                exclusions: initialRule?.exclusions ?? [],
                createdAt: initialRule?.createdAt ?? Date.now()
              });
              return;
            }
            if (isHolidayMode) {
              if (isHoliday) {
                onSaveHoliday({
                  id: initialHoliday?.id ?? crypto.randomUUID(),
                  title: title || "Holiday",
                  date,
                  memo: memo || undefined,
                  labelId: labelId || undefined,
                  createdAt: initialHoliday?.createdAt ?? Date.now(),
                  kind: "HOLIDAY"
                });
                return;
              }
              onSaveSchedule({
                id: initialHoliday?.id ?? crypto.randomUUID(),
                title: title || "Untitled",
                date,
                type: "DATE",
                importance: "LOW",
                labelId: labelId || undefined,
                memo
              });
              return;
            }
            if (isHoliday) {
              onSaveHoliday({
                id: initial?.id ?? crypto.randomUUID(),
                title: title || "Holiday",
                date,
                memo: memo || undefined,
                labelId: labelId || undefined,
                createdAt: Date.now(),
                kind: "HOLIDAY"
              });
              return;
            }
            onSaveSchedule({
              id: initial?.id ?? crypto.randomUUID(),
              title: title || "Untitled",
              date,
              type,
              startTime: type === "TIMED" ? startTime : undefined,
              endTime: type === "TIMED" ? endTime : undefined,
              importance,
              labelId: labelId || undefined,
              location,
              memo,
              repeat: repeatEnabled && repeatDays.length ? { daysOfWeek: repeatDays, endDate: repeatNoEnd ? "" : repeatEnd, excludeHolidays } : undefined,
              recurringRuleId: initial?.recurringRuleId
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day <= maxDay;
}
