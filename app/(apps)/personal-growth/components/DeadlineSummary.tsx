import type { Goal } from "../types";
import { deadlineLabel, pickNearestDeadlines } from "../lib/utils";

function ringProgress(dday: number) {
  const urgency = Math.max(0, 1 - Math.min(Math.abs(dday), 30) / 30);
  return Math.round(urgency * 100);
}

export function DeadlineSummary({ goals }: { goals: Goal[] }) {
  const nearest = pickNearestDeadlines(goals, 3);

  return (
    <div className="lifnux-glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Nearest Deadlines</div>
      </div>
      {nearest.length ? (
        <div className="grid gap-3 md:grid-cols-3">
          {nearest.map(({ goal, dday }) => {
            const pct = ringProgress(dday);
            return (
              <div key={goal.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center gap-3">
                  <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="#67e8f9"
                      strokeWidth="3"
                      strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
                      transform="rotate(-90 18 18)"
                    />
                    <text x="18" y="21" textAnchor="middle" fontSize="8" fill="#cbd5e1">
                      {deadlineLabel(goal.deadline)}
                    </text>
                  </svg>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{goal.title}</div>
                    <div className="text-xs text-[var(--ink-1)]">{goal.deadline}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-1)]">No deadlines in this tab.</div>
      )}
    </div>
  );
}


