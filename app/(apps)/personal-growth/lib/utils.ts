import type { Goal, GoalCountMetric, GoalProgressSnapshot, ProgressUpdate, WeeklyChecklistState } from "../types";
import { getLinkedMetricValue } from "./linkedMetrics";

export function formatDateInput(value?: string) {
  if (!value) return "-";
  return value;
}

function toLocalYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDateSafe(dateInput?: string) {
  if (!dateInput) return new Date();
  const parsed = new Date(`${dateInput}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export function startOfWeekKey(dateInput: string) {
  const date = parseLocalDateSafe(dateInput);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toLocalYmd(date);
}

export function shiftWeek(dateInput: string, deltaWeeks: number) {
  const date = parseLocalDateSafe(dateInput);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return toLocalYmd(date);
}

export function shiftMonth(dateInput: string, deltaMonths: number) {
  const date = parseLocalDateSafe(dateInput);
  date.setMonth(date.getMonth() + deltaMonths);
  return toLocalYmd(date);
}

export function shiftYear(dateInput: string, deltaYears: number) {
  const date = parseLocalDateSafe(dateInput);
  date.setFullYear(date.getFullYear() + deltaYears);
  return toLocalYmd(date);
}

export function weekRangeLabelFromWeekKey(weekKey: string) {
  const start = parseLocalDateSafe(weekKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${toLocalYmd(start)} ~ ${toLocalYmd(end)}`;
}

export function monthLabelFromDate(dateInput: string) {
  const date = parseLocalDateSafe(dateInput);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function yearLabelFromDate(dateInput: string) {
  const date = parseLocalDateSafe(dateInput);
  return `${date.getFullYear()}`;
}

export function deadlineDday(deadline?: string) {
  if (!deadline) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(`${deadline}T00:00:00`).getTime();
  const diff = Math.ceil((target - today) / 86400000);
  return diff;
}

export function deadlineLabel(deadline?: string) {
  const dday = deadlineDday(deadline);
  if (dday === null) return "No deadline";
  if (dday === 0) return "D-Day";
  return dday > 0 ? `D-${dday}` : `D+${Math.abs(dday)}`;
}

export function getLatestUpdate(goalId: string, updates: ProgressUpdate[]) {
  return [...updates]
    .filter((u) => u.goalId === goalId)
    .sort((a, b) => b.loggedForDate.localeCompare(a.loggedForDate) || b.createdAt.localeCompare(a.createdAt))[0];
}

export function getChecklistCompletion(goal: Goal, checklistStates: WeeklyChecklistState[], weekKey: string): GoalProgressSnapshot {
  const items = goal.checklistItems ?? [];
  if (!items.length) return { valueLabel: "0/0", numericValue: 0, percent: 0 };
  const state = checklistStates.find((entry) => entry.goalId === goal.id && entry.weekKey === weekKey);
  const checked = new Set(state?.checkedItemIds ?? []);
  const completed = items.filter((item) => checked.has(item.id)).length;
  const percent = (completed / items.length) * 100;
  return { valueLabel: `${completed}/${items.length}`, numericValue: completed, percent };
}

function getCountPeriodBounds(config: GoalCountMetric | undefined, weekKey: string) {
  const period = config?.period ?? "WEEK";
  if (period === "WEEK") {
    const start = parseLocalDateSafe(weekKey);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toLocalYmd(start), end: toLocalYmd(end) };
  }

  const anchorDate = parseLocalDateSafe(weekKey);
  if (period === "MONTH") {
    const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    return { start: toLocalYmd(start), end: toLocalYmd(end) };
  }

  if (period === "YEAR") {
    const start = new Date(anchorDate.getFullYear(), 0, 1);
    const end = new Date(anchorDate.getFullYear(), 11, 31);
    return { start: toLocalYmd(start), end: toLocalYmd(end) };
  }

  if (config?.periodRange?.start && config?.periodRange?.end) {
    return { start: config.periodRange.start, end: config.periodRange.end };
  }

  return { start: weekKey, end: weekKey };
}

export function getGoalProgress(
  goal: Goal,
  updates: ProgressUpdate[],
  checklistStates: WeeklyChecklistState[],
  weekKey: string
): GoalProgressSnapshot {
  if (goal.goalType === "CHECKLIST") {
    return getChecklistCompletion(goal, checklistStates, weekKey);
  }

  if (goal.goalType === "COUNT") {
    const target = goal.countMetric?.countTarget ?? 0;
    const unit = goal.countMetric?.unitLabel ?? "times";
    let count = 0;

    if (goal.trackingMode === "LINKED") {
      const linked = getLinkedMetricValue(goal.linkedSource);
      count = typeof linked?.value === "number" ? linked.value : 0;
    } else if (typeof goal.countMetric?.manualCount === "number") {
      count = goal.countMetric.manualCount;
    } else {
      const bounds = getCountPeriodBounds(goal.countMetric, weekKey);
      count = updates.filter((u) => u.goalId === goal.id && u.loggedForDate >= bounds.start && u.loggedForDate <= bounds.end).length;
    }

    const percent = target > 0 ? (count / target) * 100 : null;
    return { valueLabel: `${count}/${target} ${unit}`, numericValue: count, percent };
  }

  let numericValue: number | null = null;
  let valueLabel = "-";

  if (goal.trackingMode === "LINKED") {
    const linked = getLinkedMetricValue(goal.linkedSource);
    if (linked) {
      if (typeof linked.value === "number") {
        numericValue = linked.value;
        valueLabel = `${linked.value.toLocaleString("ko-KR")}${linked.unit ? ` ${linked.unit}` : ""}`;
      } else {
        valueLabel = linked.value;
      }
    }
  } else {
    const latest = getLatestUpdate(goal.id, updates);
    if (typeof latest?.value === "number") {
      numericValue = latest.value;
      valueLabel = `${latest.value.toLocaleString("ko-KR")}${goal.metric?.unit ? ` ${goal.metric.unit}` : ""}`;
    }
  }

  const target = goal.metric?.targetValue;
  const percent = goal.displayMode === "TARGET" && typeof target === "number" && target > 0 && typeof numericValue === "number" ? (numericValue / target) * 100 : null;
  return { valueLabel, numericValue, percent };
}

export function getCurrentStatusText(goal: Goal, updates: ProgressUpdate[]) {
  if (goal.trackingMode === "LINKED") {
    const linked = getLinkedMetricValue(goal.linkedSource);
    if (!linked) return "Linked source unavailable";
    if (typeof linked.value === "number") return `${linked.value.toLocaleString("ko-KR")}${linked.unit ? ` ${linked.unit}` : ""}`;
    return String(linked.value);
  }

  const latest = getLatestUpdate(goal.id, updates);
  if (!latest) return "No updates yet";
  const valueText = typeof latest.value === "number" ? ` (${latest.value.toLocaleString("ko-KR")}${goal.metric?.unit ? ` ${goal.metric.unit}` : ""})` : "";
  return `${latest.summary}${valueText}`;
}

export function pickNearestDeadlines(goals: Goal[], limit = 3) {
  return goals
    .filter((goal) => !!goal.deadline)
    .map((goal) => ({ goal, dday: deadlineDday(goal.deadline) }))
    .filter((entry): entry is { goal: Goal; dday: number } => entry.dday !== null)
    .sort((a, b) => Math.abs(a.dday) - Math.abs(b.dday))
    .slice(0, limit);
}
