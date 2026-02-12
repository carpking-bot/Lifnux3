"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import { DomainManagerPanel } from "./components/DomainManagerPanel";
import { GoalEditModal } from "./components/GoalEditModal";
import { GoalTable } from "./components/GoalTable";
import { personalGrowthStore } from "./lib/store";
import { monthLabelFromDate, shiftMonth, shiftWeek, shiftYear, startOfWeekKey, weekRangeLabelFromWeekKey, yearLabelFromDate } from "./lib/utils";
import type { Goal, GoalDomain, GoalScope, GoalStatus, ProgressUpdate, WeeklyChecklistState } from "./types";

const SCOPE_TABS: GoalScope[] = ["WEEKLY", "MONTHLY", "YEARLY", "LIFETIME"];
const VIEW_TABS = ["ACTIVE", "ARCHIVE"] as const;
type GoalViewTab = (typeof VIEW_TABS)[number];

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildWeekOptionsForMonth(anchorDate: string) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  let key = startOfWeekKey(toYmd(monthStart));
  const options: string[] = [];

  for (let i = 0; i < 8; i += 1) {
    const weekStart = new Date(`${key}T12:00:00`);
    if (weekStart > monthEnd && options.length > 0) break;
    options.push(key);
    key = shiftWeek(key, 1);
  }

  return options;
}

function createDraftGoal(scope: GoalScope, domains: GoalDomain[]): Goal {
  const domain = domains[0];
  return {
    id: crypto.randomUUID(),
    scope,
    domainId: domain?.id ?? "personal",
    title: "",
    details: "",
    notes: "",
    links: [],
    importance: "MIDDLE",
    status: "NOT_STARTED",
    goalType: scope === "WEEKLY" ? "CHECKLIST" : "VALUE",
    trackingMode: "MANUAL",
    displayMode: scope === "WEEKLY" ? "TRACKER" : "TARGET",
    metric: scope === "WEEKLY" ? undefined : { unit: "" },
    countMetric: scope === "WEEKLY" ? undefined : { countTarget: 1, period: "MONTH", unitLabel: "times" },
    checklistItems: scope === "WEEKLY" ? [] : undefined,
    isArchived: false
  };
}

export default function PersonalGrowthPage() {
  const [domains, setDomains] = useState<GoalDomain[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [checklistStates, setChecklistStates] = useState<WeeklyChecklistState[]>([]);
  const [activeScope, setActiveScope] = useState<GoalScope>("WEEKLY");
  const [activeView, setActiveView] = useState<GoalViewTab>("ACTIVE");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [weekDate, setWeekDate] = useState(new Date().toISOString().slice(0, 10));
  const [donePulseGoalIds, setDonePulseGoalIds] = useState<Set<string>>(new Set());
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [monthBaseYear, setMonthBaseYear] = useState(new Date().getFullYear());
  const [yearBase, setYearBase] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);

  useEffect(() => {
    const loadedDomains = personalGrowthStore.loadDomains();
    setDomains(loadedDomains);
    setGoals(personalGrowthStore.loadGoals().map((goal) => ({ ...goal, isArchived: goal.isArchived ?? false })));
    setUpdates(personalGrowthStore.loadProgressUpdates());
    setChecklistStates(personalGrowthStore.loadWeeklyChecklistStates());
  }, []);

  const weekKey = useMemo(() => startOfWeekKey(weekDate), [weekDate]);
  const weekRangeLabel = useMemo(() => weekRangeLabelFromWeekKey(weekKey), [weekKey]);
  const monthLabel = useMemo(() => monthLabelFromDate(weekDate), [weekDate]);
  const yearLabel = useMemo(() => yearLabelFromDate(weekDate), [weekDate]);
  const progressAnchorKey = activeScope === "WEEKLY" ? weekKey : weekDate;
  const weekOptions = useMemo(() => buildWeekOptionsForMonth(weekDate), [weekDate]);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, idx) => ({ idx, label: `${String(idx + 1).padStart(2, "0")}` })),
    []
  );
  const yearOptions = useMemo(() => Array.from({ length: 12 }, (_, idx) => yearBase + idx), [yearBase]);

  const filteredGoals = useMemo(() => {
    const importanceRank: Record<Goal["importance"], number> = {
      HIGH: 0,
      MIDDLE: 1,
      LOW: 2
    };
    const statusRank: Record<Goal["status"], number> = {
      PROGRESSING: 0,
      PAUSED: 1,
      NOT_STARTED: 2,
      DONE: 3,
      DROPPED: 4
    };

    const inScope = goals.filter((goal) => goal.scope === activeScope);
    const inView = inScope.filter((goal) => (activeView === "ARCHIVE" ? !!goal.isArchived : !goal.isArchived));

    return [...inView].sort((a, b) => {
      const aIsTerminal = a.status === "DONE" || a.status === "DROPPED";
      const bIsTerminal = b.status === "DONE" || b.status === "DROPPED";
      if (aIsTerminal !== bIsTerminal) return aIsTerminal ? 1 : -1;

      const statusDiff = statusRank[a.status] - statusRank[b.status];
      if (statusDiff !== 0) return statusDiff;

      const importanceDiff = importanceRank[a.importance] - importanceRank[b.importance];
      if (importanceDiff !== 0) return importanceDiff;

      const aHasDeadline = !!a.deadline;
      const bHasDeadline = !!b.deadline;
      if (aHasDeadline && bHasDeadline) {
        return (a.deadline as string).localeCompare(b.deadline as string);
      }
      if (aHasDeadline) return -1;
      if (bHasDeadline) return 1;
      return 0;
    });
  }, [activeScope, activeView, goals]);

  const handleSaveUpdate = (update: ProgressUpdate) => {
    const next = [...updates, update];
    setUpdates(next);
    personalGrowthStore.saveProgressUpdates(next);
  };

  const handleDeleteUpdate = (updateId: string) => {
    const next = updates.filter((item) => item.id !== updateId);
    setUpdates(next);
    personalGrowthStore.saveProgressUpdates(next);
  };

  const handleSaveGoal = (goal: Goal, previousStatus?: GoalStatus) => {
    const today = new Date().toISOString().slice(0, 10);
    const withStartDate = previousStatus === "NOT_STARTED" && goal.status !== "NOT_STARTED" && !goal.startDate ? { ...goal, startDate: today } : goal;
    const withArchive = { ...withStartDate, isArchived: withStartDate.isArchived ?? false };
    const exists = goals.some((item) => item.id === goal.id);
    const next = exists ? goals.map((item) => (item.id === goal.id ? withArchive : item)) : [withArchive, ...goals];
    setGoals(next);
    personalGrowthStore.saveGoals(next);
  };

  const handleDeleteGoal = (goalId: string) => {
    const nextGoals = goals.filter((item) => item.id !== goalId);
    const nextUpdates = updates.filter((item) => item.goalId !== goalId);
    const nextChecklist = checklistStates.filter((item) => item.goalId !== goalId);
    setGoals(nextGoals);
    setUpdates(nextUpdates);
    setChecklistStates(nextChecklist);
    personalGrowthStore.saveGoals(nextGoals);
    personalGrowthStore.saveProgressUpdates(nextUpdates);
    personalGrowthStore.saveWeeklyChecklistStates(nextChecklist);
  };

  const handleArchiveGoal = (goal: Goal) => {
    const archivedCopyId = crypto.randomUUID();
    const archivedCopy: Goal = {
      ...goal,
      id: archivedCopyId,
      isArchived: true
    };

    const nextGoals = [archivedCopy, ...goals];
    setGoals(nextGoals);
    personalGrowthStore.saveGoals(nextGoals);

    const copiedUpdates = updates
      .filter((item) => item.goalId === goal.id)
      .map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        goalId: archivedCopyId,
        createdAt: new Date().toISOString()
      }));
    if (copiedUpdates.length) {
      const nextUpdates = [...updates, ...copiedUpdates];
      setUpdates(nextUpdates);
      personalGrowthStore.saveProgressUpdates(nextUpdates);
    }

    const copiedChecklistStates = checklistStates
      .filter((item) => item.goalId === goal.id)
      .map((item) => ({
        ...item,
        goalId: archivedCopyId
      }));
    if (copiedChecklistStates.length) {
      const nextChecklistStates = [...checklistStates, ...copiedChecklistStates];
      setChecklistStates(nextChecklistStates);
      personalGrowthStore.saveWeeklyChecklistStates(nextChecklistStates);
    }
  };

  const handleChangeStatus = (goal: Goal, nextStatus: GoalStatus) => {
    if (goal.status === nextStatus) return;
    const today = new Date().toISOString().slice(0, 10);

    const updatedGoal: Goal = {
      ...goal,
      status: nextStatus,
      startDate: goal.status === "NOT_STARTED" && nextStatus === "PROGRESSING" && !goal.startDate ? today : goal.startDate,
      isArchived: goal.isArchived ?? false
    };

    const nextGoals = goals.map((item) => (item.id === goal.id ? updatedGoal : item));
    setGoals(nextGoals);
    personalGrowthStore.saveGoals(nextGoals);

    if (goal.goalType === "CHECKLIST" && nextStatus === "DONE") {
      const checkedItemIds = (goal.checklistItems ?? []).map((item) => item.id);
      const nextChecklist = [...checklistStates];
      const index = nextChecklist.findIndex((entry) => entry.goalId === goal.id && entry.weekKey === weekKey);
      if (index < 0) {
        nextChecklist.push({ goalId: goal.id, weekKey, checkedItemIds });
      } else {
        nextChecklist[index] = { ...nextChecklist[index], checkedItemIds };
      }
      setChecklistStates(nextChecklist);
      personalGrowthStore.saveWeeklyChecklistStates(nextChecklist);
    }

    const statusLog: ProgressUpdate = {
      id: crypto.randomUUID(),
      goalId: goal.id,
      loggedForDate: today,
      summary: `Status changed: ${goal.status} -> ${nextStatus}`,
      createdAt: new Date().toISOString()
    };
    const nextUpdates = [...updates, statusLog];
    setUpdates(nextUpdates);
    personalGrowthStore.saveProgressUpdates(nextUpdates);

    if (nextStatus === "DONE") {
      setDonePulseGoalIds((prev) => {
        const next = new Set(prev);
        next.add(goal.id);
        return next;
      });
      setTimeout(() => {
        setDonePulseGoalIds((prev) => {
          const next = new Set(prev);
          next.delete(goal.id);
          return next;
        });
      }, 1800);
    }
  };

  const handleApplyManualCount = (goal: Goal, value: number) => {
    if (goal.goalType !== "COUNT" || goal.trackingMode !== "MANUAL") return;
    const today = new Date().toISOString().slice(0, 10);
    const target = goal.countMetric?.countTarget ?? 0;
    const reachedTarget = target > 0 && value >= target;
    const nextStatus = reachedTarget ? "DONE" : goal.status;

    const updatedGoal: Goal = {
      ...goal,
      status: nextStatus,
      startDate: goal.status === "NOT_STARTED" && nextStatus !== "NOT_STARTED" && !goal.startDate ? today : goal.startDate,
      countMetric: { ...(goal.countMetric ?? { countTarget: 1, period: "WEEK" }), manualCount: value },
      isArchived: goal.isArchived ?? false
    };

    const nextGoals = goals.map((item) => (item.id === goal.id ? updatedGoal : item));
    setGoals(nextGoals);
    personalGrowthStore.saveGoals(nextGoals);

    const updateLogs: ProgressUpdate[] = [
      {
        id: crypto.randomUUID(),
        goalId: goal.id,
        loggedForDate: today,
        summary: `Count updated: ${goal.countMetric?.manualCount ?? 0} -> ${value}`,
        value,
        createdAt: new Date().toISOString()
      }
    ];

    if (goal.status !== nextStatus) {
      updateLogs.push({
        id: crypto.randomUUID(),
        goalId: goal.id,
        loggedForDate: today,
        summary: `Status changed: ${goal.status} -> ${nextStatus}`,
        createdAt: new Date().toISOString()
      });
    }

    const nextUpdates = [...updates, ...updateLogs];
    setUpdates(nextUpdates);
    personalGrowthStore.saveProgressUpdates(nextUpdates);

    if (goal.status !== "DONE" && nextStatus === "DONE") {
      setDonePulseGoalIds((prev) => {
        const next = new Set(prev);
        next.add(goal.id);
        return next;
      });
      setTimeout(() => {
        setDonePulseGoalIds((prev) => {
          const next = new Set(prev);
          next.delete(goal.id);
          return next;
        });
      }, 1800);
    }
  };

  const handleToggleChecklist = (goalId: string, itemId: string, checked: boolean) => {
    const next = [...checklistStates];
    const index = next.findIndex((entry) => entry.goalId === goalId && entry.weekKey === weekKey);
    if (index < 0) {
      next.push({ goalId, weekKey, checkedItemIds: checked ? [itemId] : [] });
    } else {
      const set = new Set(next[index].checkedItemIds);
      if (checked) set.add(itemId);
      else set.delete(itemId);
      next[index] = { ...next[index], checkedItemIds: [...set] };
    }
    setChecklistStates(next);
    personalGrowthStore.saveWeeklyChecklistStates(next);
  };

  const addDomain = (name: string, color: string) => {
    const now = new Date().toISOString();
    const next = [...domains, { id: crypto.randomUUID(), name, color, order: domains.length, createdAt: now, updatedAt: now }];
    setDomains(next);
    personalGrowthStore.saveDomains(next);
  };

  const renameDomain = (id: string, name: string) => {
    const next = domains.map((domain) => (domain.id === id ? { ...domain, name, updatedAt: new Date().toISOString() } : domain));
    setDomains(next);
    personalGrowthStore.saveDomains(next);
  };

  const changeDomainColor = (id: string, color: string) => {
    const next = domains.map((domain) => (domain.id === id ? { ...domain, color, updatedAt: new Date().toISOString() } : domain));
    setDomains(next);
    personalGrowthStore.saveDomains(next);
  };

  const deleteDomain = (id: string) => {
    const linked = goals.filter((goal) => goal.domainId === id).length;
    if (linked > 0) return;
    const next = domains.filter((domain) => domain.id !== id).map((domain, index) => ({ ...domain, order: index }));
    setDomains(next);
    personalGrowthStore.saveDomains(next);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[2320px] pb-20 pt-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl">Personal Growth</h1>
            <div className="text-sm text-[var(--ink-1)]">Spreadsheet-style goal management by scope.</div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SCOPE_TABS.map((scope) => (
            <button key={scope} className={`rounded-full border px-4 py-2 text-xs ${activeScope === scope ? "border-cyan-300/60 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`} onClick={() => setActiveScope(scope)}>
              {scope}
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-white/20" />
          {VIEW_TABS.map((tab) => (
            <button key={tab} className={`rounded-full border px-4 py-2 text-xs ${activeView === tab ? "border-emerald-300/60 text-emerald-300" : "border-white/20 text-[var(--ink-1)]"}`} onClick={() => setActiveView(tab)}>
              {tab === "ARCHIVE" ? "GOAL ARCHIVE" : tab}
            </button>
          ))}
          {activeScope === "WEEKLY" ? (
            <div className="ml-2 flex items-center gap-2 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftWeek(prev, -1))}>← Prev Week</button>
              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white">{weekRangeLabel}</span>
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekPickerOpen(true)}>Pick Week</button>
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftWeek(prev, 1))}>Next Week →</button>
            </div>
          ) : null}
          {activeScope === "MONTHLY" ? (
            <div className="ml-2 flex items-center gap-2 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftMonth(prev, -1))}>← Prev Month</button>
              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white">{monthLabel}</span>
              <button
                className="rounded-full border border-white/20 px-2 py-1 text-xs"
                onClick={() => {
                  const [y] = monthLabel.split("-");
                  const parsed = Number(y);
                  if (Number.isFinite(parsed)) setMonthBaseYear(parsed);
                  setMonthPickerOpen(true);
                }}
              >
                Pick Month
              </button>
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftMonth(prev, 1))}>Next Month →</button>
            </div>
          ) : null}
          {activeScope === "YEARLY" ? (
            <div className="ml-2 flex items-center gap-2 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftYear(prev, -1))}>← Prev Year</button>
              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white">{yearLabel}</span>
              <button
                className="rounded-full border border-white/20 px-2 py-1 text-xs"
                onClick={() => {
                  const y = Number(yearLabel);
                  if (Number.isFinite(y)) setYearBase(Math.floor(y / 12) * 12);
                  setYearPickerOpen(true);
                }}
              >
                Pick Year
              </button>
              <button className="rounded-full border border-white/20 px-2 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftYear(prev, 1))}>Next Year →</button>
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded-full border border-cyan-300/50 px-3 py-1 text-xs text-cyan-300 disabled:border-white/10 disabled:text-[var(--ink-1)]"
              disabled={activeView === "ARCHIVE"}
              onClick={() => {
                setSelectedGoal(createDraftGoal(activeScope, domains));
                setGoalModalOpen(true);
              }}
            >
              Add Goal
            </button>
            <Link className="rounded-full border border-white/20 px-3 py-1 text-xs" href="/">Back</Link>
          </div>
        </div>

        <div className="grid gap-2 lg:grid-cols-[1.8fr_300px]">
          <div className="space-y-4">
            <GoalTable
              goals={filteredGoals}
              domains={domains}
              updates={updates}
              checklistStates={checklistStates}
              weekKey={progressAnchorKey}
              isArchive={activeView === "ARCHIVE"}
              donePulseGoalIds={donePulseGoalIds}
              onChangeStatus={handleChangeStatus}
              onApplyManualCount={handleApplyManualCount}
              onSelect={(goal) => {
                setSelectedGoal(goal);
                setGoalModalOpen(true);
              }}
            />
          </div>

          <DomainManagerPanel
            domains={domains}
            goals={goals}
            onAddDomain={addDomain}
            onRenameDomain={renameDomain}
            onChangeColor={changeDomainColor}
            onDeleteDomain={deleteDomain}
          />
        </div>
      </div>

      <Modal
        open={weekPickerOpen}
        title="Pick Week"
        onClose={() => setWeekPickerOpen(false)}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[560px]"
      >
        <div className="flex items-center justify-between">
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftMonth(prev, -1))}>← Prev Month</button>
          <div className="text-xs text-[var(--ink-1)]">{monthLabel}</div>
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setWeekDate((prev) => shiftMonth(prev, 1))}>Next Month →</button>
        </div>
        <div className="grid gap-2">
          {weekOptions.map((key) => (
            <button
              key={key}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${key === weekKey ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-white"}`}
              onClick={() => {
                setWeekDate(key);
                setWeekPickerOpen(false);
              }}
            >
              {weekRangeLabelFromWeekKey(key)}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={monthPickerOpen}
        title="Pick Month"
        onClose={() => setMonthPickerOpen(false)}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[560px]"
      >
        <div className="flex items-center justify-between">
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setMonthBaseYear((prev) => prev - 1)}>← Prev Year</button>
          <div className="text-xs text-[var(--ink-1)]">{monthBaseYear}</div>
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setMonthBaseYear((prev) => prev + 1)}>Next Year →</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {monthOptions.map((month) => {
            const monthKey = `${monthBaseYear}-${month.label}`;
            const isSelected = monthKey === monthLabel;
            return (
              <button
                key={monthKey}
                className={`rounded-lg border px-3 py-2 text-xs ${isSelected ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-white"}`}
                onClick={() => {
                  setWeekDate(`${monthKey}-01`);
                  setMonthPickerOpen(false);
                }}
              >
                {month.label}
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={yearPickerOpen}
        title="Pick Year"
        onClose={() => setYearPickerOpen(false)}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[560px]"
      >
        <div className="flex items-center justify-between">
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setYearBase((prev) => prev - 12)}>← Prev</button>
          <div className="text-xs text-[var(--ink-1)]">{yearBase} - {yearBase + 11}</div>
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => setYearBase((prev) => prev + 12)}>Next →</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {yearOptions.map((year) => (
            <button
              key={year}
              className={`rounded-lg border px-3 py-2 text-xs ${String(year) === yearLabel ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-white"}`}
              onClick={() => {
                setWeekDate(`${year}-01-01`);
                setYearPickerOpen(false);
              }}
            >
              {year}
            </button>
          ))}
        </div>
      </Modal>

      <GoalEditModal
        open={goalModalOpen}
        goal={selectedGoal}
        weekKey={weekKey}
        checklistStates={checklistStates}
        updates={updates}
        domains={domains}
        onClose={() => {
          setGoalModalOpen(false);
          setSelectedGoal(null);
        }}
        onSaveGoal={handleSaveGoal}
        onDeleteGoal={handleDeleteGoal}
        onArchive={handleArchiveGoal}
        onAddUpdate={handleSaveUpdate}
        onDeleteUpdate={handleDeleteUpdate}
        onToggleChecklist={handleToggleChecklist}
      />
    </AppShell>
  );
}
