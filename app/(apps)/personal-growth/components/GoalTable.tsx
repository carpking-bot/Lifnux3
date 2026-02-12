import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import type { Goal, GoalDomain, GoalProgressSnapshot, GoalStatus, ProgressUpdate, WeeklyChecklistState } from "../types";
import { deadlineLabel, formatDateInput, getCurrentStatusText, getGoalProgress } from "../lib/utils";

const importanceClass: Record<string, string> = {
  LOW: "text-slate-300 border-white/20",
  MIDDLE: "text-amber-300 border-amber-300/40",
  HIGH: "text-rose-300 border-rose-300/40"
};

const statusClass: Record<string, string> = {
  NOT_STARTED: "text-slate-300 border-white/20",
  PROGRESSING: "text-cyan-300 border-cyan-300/40",
  DONE: "text-emerald-300 border-emerald-300/40",
  PAUSED: "text-amber-300 border-amber-300/40",
  DROPPED: "text-rose-300 border-rose-300/40"
};

const STATUS_OPTIONS: GoalStatus[] = ["NOT_STARTED", "PROGRESSING", "DONE", "PAUSED", "DROPPED"];

function progressLabel(goal: Goal, snapshot: GoalProgressSnapshot) {
  if (goal.goalType === "CHECKLIST") {
    const total = goal.checklistItems?.length ?? 0;
    const completed = snapshot.numericValue ?? 0;
    if (!total) return "X";
    return completed >= total ? "O" : "X";
  }
  if (goal.goalType === "COUNT") {
    return snapshot.percent === null ? snapshot.valueLabel : `${snapshot.valueLabel} (${snapshot.percent.toFixed(1)}%)`;
  }
  if (goal.displayMode === "TRACKER") return snapshot.valueLabel;
  if (snapshot.percent !== null && typeof goal.metric?.targetValue === "number") {
    const targetLabel = `${goal.metric.targetValue.toLocaleString("ko-KR")}${goal.metric?.unit ? ` ${goal.metric.unit}` : ""}`;
    return (
      <div className="max-w-[180px] text-xs leading-tight">
        <div className="truncate text-white">{snapshot.valueLabel}</div>
        <div className="my-1 h-px bg-white/20" />
        <div className="truncate text-white">{targetLabel}</div>
        <div className="mt-1 text-[11px] text-cyan-300">{snapshot.percent.toFixed(1)}%</div>
      </div>
    );
  }
  return snapshot.valueLabel;
}

export function GoalTable({
  goals,
  domains,
  updates,
  checklistStates,
  weekKey,
  onSelect,
  onChangeStatus,
  onApplyManualCount,
  isArchive = false,
  donePulseGoalIds
}: {
  goals: Goal[];
  domains: GoalDomain[];
  updates: ProgressUpdate[];
  checklistStates: WeeklyChecklistState[];
  weekKey: string;
  onSelect: (goal: Goal) => void;
  onChangeStatus: (goal: Goal, status: GoalStatus) => void;
  onApplyManualCount: (goal: Goal, value: number) => void;
  isArchive?: boolean;
  donePulseGoalIds?: Set<string>;
}) {
  const domainMap = new Map(domains.map((d) => [d.id, d]));
  const [countDrafts, setCountDrafts] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("업데이트 하시겠습니까?");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const lastUpdateByGoalId = useMemo(() => {
    const map = new Map<string, ProgressUpdate>();
    for (const goal of goals) {
      const latest = [...updates]
        .filter((item) => item.goalId === goal.id)
        .sort((a, b) => b.loggedForDate.localeCompare(a.loggedForDate) || b.createdAt.localeCompare(a.createdAt))[0];
      if (latest) map.set(goal.id, latest);
    }
    return map;
  }, [goals, updates]);

  useEffect(() => {
    setCountDrafts((prev) => {
      const next = { ...prev };
      goals.forEach((goal) => {
        if (goal.goalType !== "COUNT" || goal.trackingMode !== "MANUAL") return;
        if (typeof next[goal.id] === "number") return;
        next[goal.id] = goal.countMetric?.manualCount ?? 0;
      });
      Object.keys(next).forEach((goalId) => {
        if (!goals.some((goal) => goal.id === goalId && goal.goalType === "COUNT" && goal.trackingMode === "MANUAL")) {
          delete next[goalId];
        }
      });
      return next;
    });
  }, [goals]);

  const openConfirm = (text: string, action: () => void) => {
    setConfirmText(text);
    setPendingAction(() => action);
    setConfirmOpen(true);
  };

  return (
    <div className="lifnux-glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1380px] text-left text-sm">
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="bg-white/5 text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">
            <tr>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Current Status Logs</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Importance</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => {
              const snapshot = getGoalProgress(goal, updates, checklistStates, weekKey);
              const domain = domainMap.get(goal.domainId);
              const latestUpdate = lastUpdateByGoalId.get(goal.id);
              const isDone = goal.status === "DONE";
              const shouldPulse = donePulseGoalIds?.has(goal.id);
              const manualDraftValue = countDrafts[goal.id] ?? goal.countMetric?.manualCount ?? 0;
              const manualCurrentValue = goal.countMetric?.manualCount ?? 0;

              return (
                <tr key={goal.id} className={`cursor-pointer border-t border-white/10 hover:bg-white/5 ${shouldPulse ? "animate-pulse bg-emerald-400/10" : ""}`} onClick={() => onSelect(goal)}>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: domain?.color ?? "#94a3b8" }} />
                      {domain?.name ?? "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{goal.title}</div>
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-[var(--ink-1)]">
                    <div className="line-clamp-2">{latestUpdate?.summary ?? getCurrentStatusText(goal, updates)}</div>
                    {latestUpdate ? <div className="mt-0.5 text-[11px]">{latestUpdate.loggedForDate}</div> : null}
                  </td>
                  <td className="max-w-[320px] px-4 py-3 text-[var(--ink-1)]">
                    <div className="line-clamp-2 break-words">{goal.details || "-"}</div>
                  </td>
                  <td className="max-w-[320px] px-4 py-3 text-[var(--ink-1)]">
                    <div className="line-clamp-2 break-words">{goal.notes || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {isArchive ? (
                      <span className={`rounded-full border px-2 py-1 text-xs ${statusClass[goal.status]}`}>{goal.status}</span>
                    ) : (
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={goal.status}
                          onChange={(event) => {
                            const next = event.target.value as GoalStatus;
                            if (next === goal.status) return;
                            openConfirm("상태를 변경하시겠습니까?", () => onChangeStatus(goal, next));
                          }}
                          className={`lifnux-select rounded-full border px-2 py-1 text-xs ${statusClass[goal.status]} bg-black/40`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {isDone ? <div className="mt-1 text-[11px] text-emerald-300">CLEARED</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs ${importanceClass[goal.importance]}`}>{goal.importance}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs text-cyan-300">{deadlineLabel(goal.deadline)}</div>
                    <div>{formatDateInput(goal.deadline)}</div>
                    <div className="text-xs text-[var(--ink-1)]">Start: {formatDateInput(goal.startDate)}</div>
                  </td>
                  <td className="max-w-[170px] px-4 py-3">
                    {goal.goalType === "COUNT" && goal.trackingMode === "MANUAL" && !isArchive ? (
                      <div className="space-y-1.5" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/25 px-1.5 py-1">
                          <span className="min-w-[42px] text-center text-sm font-semibold text-white">{manualDraftValue}</span>
                          <div className="flex flex-col gap-1">
                            <button
                              className="h-3 w-4.5 rounded border border-white/30 bg-black/40 text-[8px] leading-none text-white"
                              onClick={() => setCountDrafts((prev) => ({ ...prev, [goal.id]: (prev[goal.id] ?? manualDraftValue) + 1 }))}
                              aria-label="Increase count"
                            >
                              ▲
                            </button>
                            <button
                              className="h-3 w-4.5 rounded border border-white/30 bg-black/40 text-[8px] leading-none text-white"
                              onClick={() => setCountDrafts((prev) => ({ ...prev, [goal.id]: Math.max(0, (prev[goal.id] ?? manualDraftValue) - 1) }))}
                              aria-label="Decrease count"
                            >
                              ▼
                            </button>
                          </div>
                          <span className="text-[11px] text-[var(--ink-1)]">/</span>
                          <span className="text-xs font-medium text-cyan-300">{goal.countMetric?.countTarget ?? 0}</span>
                        </div>
                        <button
                          className="rounded-full border border-cyan-300/50 px-3 py-1 text-xs text-cyan-300 disabled:border-white/10 disabled:text-[var(--ink-1)]"
                          disabled={manualDraftValue === manualCurrentValue}
                          onClick={() => {
                            openConfirm("횟수 업데이트를 적용하시겠습니까?", () => onApplyManualCount(goal, manualDraftValue));
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    ) : (
                      progressLabel(goal, snapshot)
                    )}
                  </td>
                </tr>
              );
            })}
            {!goals.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[var(--ink-1)]">
                  No goals in this scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title="Confirm Update"
        description={confirmText}
        confirmLabel="Apply"
        cancelLabel="Cancel"
        onCancel={() => {
          setConfirmOpen(false);
          setPendingAction(null);
        }}
        onConfirm={() => {
          pendingAction?.();
          setConfirmOpen(false);
          setPendingAction(null);
        }}
      />
    </div>
  );
}
