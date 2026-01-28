import { formatDateKey } from "../../../(shared)/lib/date";
import { CalendarEvent, Label } from "../../../(shared)/types/calendar";
import { DayCell } from "./DayCell";

export function CalendarGrid({
  days,
  monthIndex,
  year,
  events,
  holidaySet,
  holidayTitles,
  labels,
  onSelect,
  resolveEvents,
  onEventClick
}: {
  days: Date[];
  monthIndex: number;
  year: number;
  events: CalendarEvent[];
  holidaySet: Set<string>;
  holidayTitles: Record<string, string[]>;
  labels: Label[];
  onSelect: (dateKey: string) => void;
  resolveEvents?: (dateKey: string) => CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-3">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
        <div key={label} className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
          {label}
        </div>
      ))}
      {days.map((date) => {
        const key = formatDateKey(date);
        const isCurrent = date.getFullYear() === year && date.getMonth() === monthIndex;
        const dayEvents = resolveEvents ? resolveEvents(key) : events.filter((event) => event.date === key);
        return (
          <DayCell
            key={key}
            date={date}
            inMonth={isCurrent}
            events={dayEvents}
            isHoliday={holidaySet.has(key)}
            holidayTitles={holidayTitles[key]}
            labels={labels}
            onEventClick={onEventClick}
            onSelect={() => onSelect(key)}
          />
        );
      })}
    </div>
  );
}
