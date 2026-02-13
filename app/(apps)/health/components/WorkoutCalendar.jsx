import { monthGridFromMonthKey, monthLabel } from "../lib/date";
export function WorkoutCalendar({ monthKey, selectedDateKey, markedDateCounts, onChangeMonth, onSelectDate }) {
    const cells = monthGridFromMonthKey(monthKey);
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return (<section className="rounded-xl border border-white/10 bg-black/15 p-3">
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => onChangeMonth(-1)}>
          Prev
        </button>
        <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">{monthLabel(monthKey)}</div>
        <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => onChangeMonth(1)}>
          Next
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((label, idx) => (<div key={label} className={`px-2 py-1 text-center text-[10px] uppercase tracking-[0.08em] ${idx >= 5 ? "text-rose-300" : "text-[var(--ink-1)]"}`}>
            {label}
          </div>))}
        {cells.map((cell) => {
            const dayIndex = (new Date(`${cell.dateKey}T12:00:00`).getDay() + 6) % 7;
            const weekendText = dayIndex >= 5 ? "text-rose-300" : "";
            const selected = cell.dateKey === selectedDateKey;
            const count = markedDateCounts[cell.dateKey] ?? 0;
            const hasWorkout = count > 0;
            let stateClass = "";
            if (selected && hasWorkout) {
                stateClass = "border-[var(--accent-3)] bg-[rgba(154,230,110,0.28)] text-[#f3ffe7]";
            }
            else if (selected) {
                stateClass = "border-[var(--accent-1)] bg-[rgba(90,214,208,0.15)] text-[var(--ink-0)]";
            }
            else if (hasWorkout) {
                stateClass = "border-[rgba(154,230,110,0.6)] bg-[rgba(154,230,110,0.18)] text-[#e9ffd8]";
            }
            else if (cell.inCurrentMonth) {
                stateClass = "border-white/10 bg-black/20 text-[var(--ink-1)] hover:border-white/25";
            }
            else {
                stateClass = "border-white/5 bg-black/10 text-white/35";
            }
            return (<button key={cell.dateKey} className={`relative min-h-10 rounded-md border px-1 py-1 text-xs transition ${stateClass}`} onClick={() => onSelectDate(cell.dateKey)}>
              <div className={weekendText}>{cell.dayOfMonth}</div>
            </button>);
        })}
      </div>
    </section>);
}
