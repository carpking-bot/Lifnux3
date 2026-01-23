import { CalendarEvent } from "../../(shared)/types/calendar";
import { DayCell } from "./DayCell";

export function CalendarGrid({
  days,
  monthIndex,
  year,
  events,
  holidaySet,
  onSelect,
  resolveEvents
}: {
  days: Date[];
  monthIndex: number;
  year: number;
  events: CalendarEvent[];
  holidaySet: Set<string>;
  onSelect: (dateKey: string) => void;
  resolveEvents?: (dateKey: string) => CalendarEvent[];
}) {
  return (
    <div className="grid grid-cols-7 gap-3">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
        <div key={label} className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
          {label}
        </div>
      ))}
      {days.map((date) => {
        const key = date.toISOString().slice(0, 10);
        const isCurrent = date.getFullYear() === year && date.getMonth() === monthIndex;
        const dayEvents = resolveEvents ? resolveEvents(key) : events.filter((event) => event.date === key);
        return (
          <DayCell
            key={key}
            date={date}
            inMonth={isCurrent}
            events={dayEvents}
            isHoliday={holidaySet.has(key)}
            onSelect={() => onSelect(key)}
          />
        );
      })}
    </div>
  );
}
