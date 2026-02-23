import { CalendarEvent, Label } from "../../../(shared)/types/calendar";

function importanceRank(importance: CalendarEvent["importance"]) {
  return {
    LOW: 0,
    MIDDLE: 1,
    HIGH: 2,
    CRITICAL: 3
  }[importance];
}

const warnedLabelIds = new Set<string>();

export function DayCell({
  date,
  inMonth,
  isToday,
  events,
  isHoliday,
  holidayTitles,
  labels,
  onEventClick,
  onSelect
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  isHoliday: boolean;
  holidayTitles?: string[];
  labels: Label[];
  onEventClick?: (event: CalendarEvent) => void;
  onSelect: () => void;
}) {
  const weekday = date.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const displayEvents = events.filter((event) => importanceRank(event.importance) >= 1);
  const holidayTitle = holidayTitles?.[0];
  const labelMap = new Map(labels.map((label) => [label.id, label.color]));

  const fallbackColor = (importance: CalendarEvent["importance"]) => {
    if (importance === "CRITICAL") return "var(--accent-2)";
    if (importance === "HIGH") return "var(--accent-1)";
    if (importance === "MIDDLE") return "var(--accent-3)";
    return "var(--ink-1)";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={`min-h-[90px] rounded-2xl p-3 text-left transition hover:scale-[1.01] ${
        inMonth ? "lifnux-glass" : "bg-transparent opacity-50"
      } ${
        isToday && inMonth ? "ring-1 ring-[var(--accent-1)] bg-[var(--accent-1)]/10" : ""
      }`}
    >
      <div
        className={`text-sm ${
          isToday && inMonth
            ? "font-semibold text-[var(--accent-1)]"
            : isWeekend || isHoliday
              ? "text-[var(--accent-2)]"
              : "text-[var(--ink-0)]"
        }`}
      >
        {date.getDate()}
      </div>
      {holidayTitle ? (
        <div className="mt-1 truncate text-[11px] text-[var(--accent-2)]/80">{holidayTitle}</div>
      ) : null}
      <div className="mt-2 space-y-1">
        {displayEvents.slice(0, 3).map((event) => {
          const labelColor = event.labelId ? labelMap.get(event.labelId) : undefined;
          if (event.labelId && !labelColor && !warnedLabelIds.has(event.labelId)) {
            console.warn(`Calendar label missing for id: ${event.labelId}`);
            warnedLabelIds.add(event.labelId);
          }
          const dotColor = labelColor ?? fallbackColor(event.importance);
          return (
            <button
              key={event.id}
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={(eventClick) => {
                eventClick.stopPropagation();
                onEventClick?.(event);
              }}
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: dotColor }} />
              <div className="min-w-0 truncate text-xs text-[var(--ink-1)]">{event.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
