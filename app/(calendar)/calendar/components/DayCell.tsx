import { CalendarEvent } from "../../(shared)/types/calendar";

function importanceRank(importance: CalendarEvent["importance"]) {
  return {
    LOW: 0,
    MIDDLE: 1,
    HIGH: 2,
    CRITICAL: 3
  }[importance];
}

export function DayCell({
  date,
  inMonth,
  events,
  isHoliday,
  onSelect
}: {
  date: Date;
  inMonth: boolean;
  events: CalendarEvent[];
  isHoliday: boolean;
  onSelect: () => void;
}) {
  const weekday = date.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const displayEvents = events.filter((event) => importanceRank(event.importance) >= 1);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-[90px] rounded-2xl p-3 text-left transition hover:scale-[1.01] ${
        inMonth ? "lifnux-glass" : "bg-transparent opacity-50"
      }`}
    >
      <div className={`text-sm ${isWeekend || isHoliday ? "text-[var(--accent-2)]" : "text-[var(--ink-0)]"}`}>
        {date.getDate()}
      </div>
      <div className="mt-2 space-y-1">
        {displayEvents.slice(0, 3).map((event) => (
          <div key={event.id} className="truncate text-xs text-[var(--ink-1)]">
            {event.title}
          </div>
        ))}
      </div>
    </button>
  );
}
