import type { ActivityLog, ActivityPlanMode, ActivityType } from "../types";
import { resolveActivityIcon } from "../lib/icon";
import { WorkoutCalendar } from "./WorkoutCalendar";

type ActivityInfoPanelProps = {
  selectedType: ActivityType;
  selectedDateKey: string;
  calendarMonthKey: string;
  markedDateCounts: Record<string, number>;
  weeklyCount: number;
  weeklyTarget: number;
  monthlyCount: number;
  runningWeeklyKm: number;
  runningMonthlyKm: number;
  recentLogs: ActivityLog[];
  onAddLog: () => void;
  onEditTarget: () => void;
  onChangePlanMode: (planMode: ActivityPlanMode) => void;
  onCalendarMonthChange: (offset: number) => void;
  onCalendarDateSelect: (dateKey: string) => void;
  onOpenRunningGame: () => void;
  onEditLog: (log: ActivityLog) => void;
  onDeleteLog: (log: ActivityLog) => void;
};

function logMeta(log: ActivityLog) {
  const items: string[] = [];
  if (typeof log.durationMin === "number") items.push(`${log.durationMin} min`);
  if ((log.typeId === "running" || log.typeId === "walking" || log.typeId === "bicycle") && typeof log.distanceKm === "number") {
    items.push(`${log.distanceKm.toFixed(1)} km`);
  }
  if (log.typeId === "running" && log.paceText) items.push(`pace ${log.paceText}`);
  return items.join(" / ");
}

export function ActivityInfoPanel({
  selectedType,
  selectedDateKey,
  calendarMonthKey,
  markedDateCounts,
  weeklyCount,
  weeklyTarget,
  monthlyCount,
  runningWeeklyKm,
  runningMonthlyKm,
  recentLogs,
  onAddLog,
  onEditTarget,
  onChangePlanMode,
  onCalendarMonthChange,
  onCalendarDateSelect,
  onOpenRunningGame,
  onEditLog,
  onDeleteLog
}: ActivityInfoPanelProps) {
  const summaryItems: string[] = [];
  if (selectedType.planMode === "weekly") {
    summaryItems.push(`Weekly progress: ${weeklyCount}/${weeklyTarget}`);
  } else if (selectedType.planMode === "monthly") {
    summaryItems.push(`Monthly progress: ${monthlyCount}/${selectedType.monthlyTargetCount}`);
  }
  summaryItems.push(`Monthly sessions: ${monthlyCount}`);
  if (selectedType.id === "running" || selectedType.id === "walking" || selectedType.id === "bicycle") {
    summaryItems.push(`Weekly distance: ${runningWeeklyKm.toFixed(1)} km`);
    summaryItems.push(`Monthly distance: ${runningMonthlyKm.toFixed(1)} km`);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[#111823] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl">
              {resolveActivityIcon(selectedType.id, selectedType.icon)} {selectedType.name}
            </h2>
            <select
              className="lifnux-select rounded-full border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-1)]"
              value={selectedType.planMode}
              onChange={(event) => onChangePlanMode(event.target.value as ActivityPlanMode)}
            >
              <option value="unplanned">Unplanned</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="mt-1 space-y-1 text-sm text-[var(--ink-1)]">
            {summaryItems.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={onAddLog}>
            Log Workout
          </button>
          {selectedType.planMode !== "unplanned" ? (
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={onEditTarget}>
              Edit Target
            </button>
          ) : null}
          {selectedType.id === "running" ? (
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={onOpenRunningGame}>
              Open Running Game
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Calendar</div>
        <div className="mb-2 text-xs text-[var(--ink-1)]">Click a date to open workout log modal. Selected: {selectedDateKey}</div>
        <WorkoutCalendar
          monthKey={calendarMonthKey}
          selectedDateKey={selectedDateKey}
          markedDateCounts={markedDateCounts}
          onChangeMonth={onCalendarMonthChange}
          onSelectDate={onCalendarDateSelect}
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Recent Logs</div>
        {recentLogs.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-[var(--ink-1)]">No logs yet.</div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm">{log.loggedForDate}</div>
                    <div className="mt-1 text-xs text-[var(--ink-1)]">{logMeta(log) || "No details"}</div>
                    {log.memo ? <div className="mt-1 text-xs text-[var(--ink-1)]">{log.memo}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => onEditLog(log)}>
                      Edit
                    </button>
                    <button className="rounded-full border border-[var(--accent-2)]/50 px-3 py-1 text-xs text-[var(--accent-2)]" onClick={() => onDeleteLog(log)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
