"use client";

import { useState } from "react";
import { CalendarEvent, HolidayEvent, Importance, Label } from "../../(shared)/types/calendar";

const importanceOptions: Importance[] = ["LOW", "MIDDLE", "HIGH", "CRITICAL"];

export function EventEditor({
  date,
  labels,
  initial,
  defaultStartTime,
  defaultEndTime,
  defaultType,
  onSaveSchedule,
  onSaveHoliday
}: {
  date: string;
  labels: Label[];
  initial?: CalendarEvent;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultType?: CalendarEvent["type"];
  onSaveSchedule: (event: CalendarEvent) => void;
  onSaveHoliday: (event: HolidayEvent) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<CalendarEvent["type"]>(initial?.type ?? defaultType ?? "TIMED");
  const [startTime, setStartTime] = useState(initial?.startTime ?? defaultStartTime ?? "07:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? defaultEndTime ?? "08:00");
  const [importance, setImportance] = useState<Importance>(initial?.importance ?? "LOW");
  const [labelId, setLabelId] = useState(initial?.labelId ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [repeatDays, setRepeatDays] = useState<number[]>(initial?.repeat?.daysOfWeek ?? []);
  const [repeatEnd, setRepeatEnd] = useState(initial?.repeat?.endDate ?? "");
  const [isHoliday, setIsHoliday] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(!!initial?.repeat);

  const toggleDay = (day: number) => {
    setRepeatDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
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
      <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
        Label
        <select
          className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          value={labelId}
          onChange={(event) => setLabelId(event.target.value)}
          disabled={isHoliday}
        >
          <option value="">None</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
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
      <div className={`space-y-2 ${isHoliday ? "opacity-50" : ""}`}>
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
              }
            }}
            disabled={isHoliday}
          />
          Repeat
        </label>
        {repeatEnabled ? (
          <>
            <div className="text-xs uppercase tracking-wide text-[var(--ink-1)]">Repeat (Mon-Sun)</div>
            <div className="grid grid-cols-7 gap-2 text-xs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(index + 1 === 7 ? 0 : index + 1)}
                  className={`rounded-lg px-2 py-1 ${
                    repeatDays.includes(index + 1 === 7 ? 0 : index + 1) ? "bg-white/20" : "bg-black/30"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Repeat End Date
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={repeatEnd}
                onChange={(event) => setRepeatEnd(event.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>
          </>
        ) : null}
      </div>
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
            }
          }}
        />
        AS A HOLIDAY
      </label>
      <div className="text-right">
        <button
          className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-black"
          onClick={() => {
            if (isHoliday) {
              onSaveHoliday({
                id: initial?.id ?? crypto.randomUUID(),
                title: title || "Holiday",
                date,
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
              repeat: repeatEnabled && repeatDays.length && repeatEnd ? { daysOfWeek: repeatDays, endDate: repeatEnd } : undefined
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
