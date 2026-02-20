"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { ActivityIconRow } from "./components/ActivityIconRow";
import { ActivityInfoPanel } from "./components/ActivityInfoPanel";
import { BadgeShowcasePanel, LevelFlamePanel } from "./components/GamificationSidePanels";
import { LogEditorModal } from "./components/LogEditorModal";
import { PlainModal } from "./components/PlainModal";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { TargetEditorModal } from "./components/TargetEditorModal";
import { calculateLogXP, calculateStreak } from "./lib/gamification";
import {
  isInMonth,
  isInWeek,
  monthGridFromMonthKey,
  monthKeyFromDateKey,
  shiftMonthKey,
  todayDateKey,
  weekKeyFromDateKey,
  weekRangeLabel
} from "./lib/date";
import { generateHealthTestLogs } from "./lib/seed";
import { createHealthStore } from "./lib/store";
import type { ActivityLog, ActivityLogDraft, ActivityType, ActivityTypeId, ActivityWeeklyTarget } from "./types";

const TEST_MODE_KEY = "lifnux.health.debug.testMode.v1";

function fallbackTypes(): ActivityType[] {
  const now = new Date().toISOString();
  return [
    { id: "running", name: "Running", icon: "run", planMode: "weekly", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "walking", name: "Walking", icon: "walk", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "bicycle", name: "Bicycle", icon: "bicycle", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "swimming", name: "Swimming", icon: "swim", planMode: "weekly", weeklyTargetCount: 3, monthlyTargetCount: 12, createdAt: now, updatedAt: now },
    { id: "home", name: "Home Training", icon: "home", planMode: "weekly", weeklyTargetCount: 3, monthlyTargetCount: 12, createdAt: now, updatedAt: now },
    { id: "soccer", name: "Soccer", icon: "soccer", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "gym", name: "Gym", icon: "gym", planMode: "weekly", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "tennis", name: "Tennis", icon: "tennis", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now }
  ];
}

function daysInMonth(monthKey: string) {
  return monthGridFromMonthKey(monthKey)
    .filter((cell) => cell.inCurrentMonth)
    .map((cell) => cell.dateKey);
}

function distributeDateKeys(dayKeys: string[], sessionCount: number) {
  if (sessionCount <= 0 || !dayKeys.length) return [] as string[];
  if (sessionCount <= dayKeys.length) {
    if (sessionCount === 1) return [dayKeys[dayKeys.length - 1]];
    return Array.from({ length: sessionCount }, (_, idx) => {
      const pos = Math.round((idx * (dayKeys.length - 1)) / (sessionCount - 1));
      return dayKeys[pos];
    });
  }
  return Array.from({ length: sessionCount }, (_, idx) => dayKeys[idx % dayKeys.length]);
}

function defaultDurationByType(typeId: ActivityTypeId) {
  if (typeId === "running") return 40;
  if (typeId === "walking") return 45;
  if (typeId === "bicycle") return 50;
  if (typeId === "swimming") return 45;
  if (typeId === "home") return 35;
  if (typeId === "soccer") return 70;
  if (typeId === "gym") return 60;
  if (typeId === "tennis") return 65;
  return 40;
}

function buildSyntheticLogsForType(
  typeId: ActivityTypeId,
  dateKeys: string[],
  totalDistanceKm: number,
  createdAtSeed = Date.now()
): ActivityLog[] {
  const isDistanceType = typeId === "running" || typeId === "walking" || typeId === "bicycle";
  const perDistance = isDistanceType && dateKeys.length > 0 ? totalDistanceKm / dateKeys.length : 0;
  return dateKeys.map((dateKey, idx) => ({
    id: crypto.randomUUID(),
    typeId,
    loggedForDate: dateKey,
    durationMin: defaultDurationByType(typeId),
    distanceKm: isDistanceType ? Number(perDistance.toFixed(2)) : undefined,
    memo: "Test quick-fill",
    createdAt: new Date(createdAtSeed + idx * 1000).toISOString()
  }));
}

function compareLogsDesc(a: ActivityLog, b: ActivityLog) {
  if (a.loggedForDate !== b.loggedForDate) return b.loggedForDate.localeCompare(a.loggedForDate);
  return b.createdAt.localeCompare(a.createdAt);
}

function emptyCountRecord() {
  return {
    running: 0,
    walking: 0,
    bicycle: 0,
    swimming: 0,
    home: 0,
    soccer: 0,
    gym: 0,
    tennis: 0,
    test_distance: 0,
    test_count: 0
  } satisfies Record<ActivityTypeId, number>;
}

function countByTypeInWeek(logs: ActivityLog[], weekKey: string) {
  const counts = emptyCountRecord();
  for (const log of logs) {
    if (isInWeek(log.loggedForDate, weekKey)) counts[log.typeId] += 1;
  }
  return counts;
}

function countByTypeInMonth(logs: ActivityLog[], monthKey: string) {
  const counts = emptyCountRecord();
  for (const log of logs) {
    if (isInMonth(log.loggedForDate, monthKey)) counts[log.typeId] += 1;
  }
  return counts;
}

export default function HealthPage() {
  const router = useRouter();
  const todayKey = todayDateKey();
  const [isTestMode, setIsTestMode] = useState(false);
  const [testModeReady, setTestModeReady] = useState(false);

  const [types, setTypes] = useState<ActivityType[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [weeklyTargets, setWeeklyTargets] = useState<ActivityWeeklyTarget[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<ActivityTypeId>("running");
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [calendarMonthKey, setCalendarMonthKey] = useState(monthKeyFromDateKey(todayKey));
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<ActivityLog | null>(null);
  const [deletingLog, setDeletingLog] = useState<ActivityLog | null>(null);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [enterTestConfirmOpen, setEnterTestConfirmOpen] = useState(false);
  const [clearMainLogsConfirmOpen, setClearMainLogsConfirmOpen] = useState(false);
  const [testOverallSessionsInput, setTestOverallSessionsInput] = useState("0");
  const [testOverallDistanceInput, setTestOverallDistanceInput] = useState("0");
  const [testMonthKeyInput, setTestMonthKeyInput] = useState(monthKeyFromDateKey(todayDateKey()));
  const [testMonthSessionsInput, setTestMonthSessionsInput] = useState("0");
  const [testMonthDistanceInput, setTestMonthDistanceInput] = useState("0");
  const [xpGainModalValue, setXpGainModalValue] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeStore = useMemo(() => createHealthStore(isTestMode ? "test" : "main"), [isTestMode]);

  useEffect(() => {
    setIsTestMode(loadState<boolean>(TEST_MODE_KEY, false));
    setTestModeReady(true);
  }, []);

  useEffect(() => {
    // Recovery guard: ensure hidden modal state/scroll-lock never blocks interactions on entry.
    setLogModalOpen(false);
    setTargetModalOpen(false);
    setDebugModalOpen(false);
    setEnterTestConfirmOpen(false);
    setClearMainLogsConfirmOpen(false);
    setDeletingLog(null);
    setXpGainModalValue(null);
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  }, []);

  useEffect(() => {
    try {
      const loadedTypes = activeStore.loadActivityTypes();
      setTypes(loadedTypes.length ? loadedTypes : fallbackTypes());
      setLogs(activeStore.loadActivityLogs());
      setWeeklyTargets(activeStore.loadWeeklyTargets());
    } catch {
      setTypes(fallbackTypes());
      setLogs([]);
      setWeeklyTargets([]);
      setToast("Health data recovered with fallback defaults.");
    }
  }, [activeStore]);

  useEffect(() => {
    if (!testModeReady) return;
    saveState(TEST_MODE_KEY, isTestMode);
    if (!isTestMode) return;
    setSelectedTypeId("running");
    setSelectedDateKey(todayDateKey());
    setCalendarMonthKey(monthKeyFromDateKey(todayDateKey()));
  }, [isTestMode, testModeReady]);

  const safeTypes = useMemo(() => (types.length ? types : fallbackTypes()), [types]);

  useEffect(() => {
    if (!safeTypes.length) return;
    if (!safeTypes.some((item) => item.id === selectedTypeId)) setSelectedTypeId(safeTypes[0].id);
  }, [safeTypes, selectedTypeId]);

  const effectiveLogs = useMemo(() => logs, [logs]);
  const selectedType = useMemo(() => safeTypes.find((item) => item.id === selectedTypeId) ?? safeTypes[0], [safeTypes, selectedTypeId]);
  const gamificationBaseDateKey = useMemo(() => {
    if (!isTestMode) return todayKey;
    return effectiveLogs.reduce((max, log) => (log.loggedForDate > max ? log.loggedForDate : max), todayKey);
  }, [effectiveLogs, isTestMode, todayKey]);

  const currentWeekKey = weekKeyFromDateKey(todayKey);
  const currentMonthKey = monthKeyFromDateKey(todayKey);
  const selectedWeekKey = weekKeyFromDateKey(selectedDateKey);
  const selectedMonthKey = monthKeyFromDateKey(selectedDateKey);

  const weeklyCountsSelected = useMemo(() => countByTypeInWeek(effectiveLogs, selectedWeekKey), [effectiveLogs, selectedWeekKey]);
  const monthlyCountsSelected = useMemo(() => countByTypeInMonth(effectiveLogs, selectedMonthKey), [effectiveLogs, selectedMonthKey]);

  const weeklyTotal = useMemo(() => effectiveLogs.filter((item) => isInWeek(item.loggedForDate, currentWeekKey)).length, [effectiveLogs, currentWeekKey]);
  const monthlyTotal = useMemo(() => effectiveLogs.filter((item) => isInMonth(item.loggedForDate, currentMonthKey)).length, [effectiveLogs, currentMonthKey]);

  const selectedDistanceWeeklyKm = useMemo(() => {
    return effectiveLogs
      .filter(
        (item) =>
          (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle") &&
          item.typeId === selectedTypeId &&
          isInWeek(item.loggedForDate, selectedWeekKey)
      )
      .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
  }, [effectiveLogs, selectedTypeId, selectedWeekKey]);

  const selectedDistanceMonthlyKm = useMemo(() => {
    return effectiveLogs
      .filter(
        (item) =>
          (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle") &&
          item.typeId === selectedTypeId &&
          isInMonth(item.loggedForDate, selectedMonthKey)
      )
      .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
  }, [effectiveLogs, selectedTypeId, selectedMonthKey]);

  const streakStats = useMemo(() => calculateStreak(effectiveLogs, gamificationBaseDateKey), [effectiveLogs, gamificationBaseDateKey]);

  const selectedWeeklyTarget = useMemo(() => {
    if (!selectedType) return 0;
    const override = weeklyTargets.find((item) => item.typeId === selectedType.id && item.weekKey === selectedWeekKey);
    return override ? override.targetCount : selectedType.weeklyTargetCount;
  }, [selectedType, selectedWeekKey, weeklyTargets]);

  const selectedWeeklyCount = selectedType ? weeklyCountsSelected[selectedType.id] : 0;
  const selectedMonthlyCount = selectedType ? monthlyCountsSelected[selectedType.id] : 0;
  const isSelectedDistanceType = selectedType ? selectedType.id === "running" || selectedType.id === "walking" || selectedType.id === "bicycle" : false;

  const recentLogs = useMemo(() => {
    if (!selectedType) return [];
    return effectiveLogs.filter((item) => item.typeId === selectedType.id).sort(compareLogsDesc).slice(0, 5);
  }, [effectiveLogs, selectedType]);

  const markedDateCounts = useMemo(() => {
    if (!selectedType) return {};
    const visible = new Set(monthGridFromMonthKey(calendarMonthKey).map((cell) => cell.dateKey));
    const result: Record<string, number> = {};
    for (const log of effectiveLogs) {
      if (log.typeId !== selectedType.id) continue;
      if (!visible.has(log.loggedForDate)) continue;
      result[log.loggedForDate] = (result[log.loggedForDate] ?? 0) + 1;
    }
    return result;
  }, [effectiveLogs, selectedType, calendarMonthKey]);

  const handleCreateOrUpdateLog = (draft: ActivityLogDraft) => {
    if (editingLog) {
      const updated = activeStore.updateActivityLog(editingLog.id, draft);
      if (!updated) {
        setToast("Unable to update the log.");
        return;
      }
      setLogs(activeStore.loadActivityLogs());
      setToast("Workout log updated.");
      setEditingLog(null);
      setLogModalOpen(false);
      return;
    }
    activeStore.createActivityLog(draft);
    setLogs(activeStore.loadActivityLogs());
    setXpGainModalValue(calculateLogXP(draft));
    setToast(null);
    setLogModalOpen(false);
  };

  const handleDeleteLog = (log: ActivityLog) => {
    setDeletingLog(log);
  };

  const confirmDeleteLog = () => {
    if (!deletingLog) return;
    activeStore.deleteActivityLog(deletingLog.id);
    setDeletingLog(null);
    setLogs(activeStore.loadActivityLogs());
    setToast("Workout log deleted.");
  };

  const handleSaveTarget = (nextTarget: number) => {
    if (!selectedType || selectedType.planMode === "unplanned") return;
    if (selectedType.planMode === "weekly") {
      setWeeklyTargets(activeStore.upsertWeeklyTarget(selectedType.id, selectedWeekKey, nextTarget));
      setTargetModalOpen(false);
      setToast(`Weekly target saved for ${weekRangeLabel(selectedWeekKey)}.`);
      return;
    }
    setTypes(activeStore.updateTarget(selectedType.id, selectedType.planMode, nextTarget));
    setTargetModalOpen(false);
    setToast("Monthly target saved.");
  };

  const handleChangePlanMode = (planMode: "unplanned" | "weekly" | "monthly") => {
    if (!selectedType) return;
    setTypes(activeStore.updatePlanMode(selectedType.id, planMode));
    setToast(`${selectedType.name} mode changed to ${planMode}.`);
  };

  const handleGenerateTestData = () => {
    if (isTestMode) {
      setToast("Main 데이터 생성은 Test Mode 밖에서만 가능합니다.");
      return;
    }
    const generated = generateHealthTestLogs();
    activeStore.saveActivityLogs(generated);
    setLogs(generated);
    setToast(`Generated ${generated.length} test logs.`);
  };

  const handleConfirmEnterTestMode = () => {
    setIsTestMode(true);
    setEnterTestConfirmOpen(false);
    setDebugModalOpen(false);
    setToast("Test mode enabled.");
  };

  const handleExitTestMode = () => {
    setIsTestMode(false);
    setDebugModalOpen(false);
    setToast("Returned to main mode.");
  };

  const handleClearMainLogs = () => {
    const mainStore = createHealthStore("main");
    mainStore.saveActivityLogs([]);
    if (!isTestMode) setLogs([]);
    setClearMainLogsConfirmOpen(false);
    setDebugModalOpen(false);
    setToast("Main health logs cleared.");
  };

  const syncTestQuickToolInputs = () => {
    if (!isTestMode || !selectedType) return;
    const totalSessions = effectiveLogs.filter((log) => log.typeId === selectedType.id).length;
    const totalDistance = effectiveLogs
      .filter((log) => log.typeId === selectedType.id)
      .reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);
    const monthSessions = effectiveLogs.filter((log) => log.typeId === selectedType.id && isInMonth(log.loggedForDate, calendarMonthKey)).length;
    const monthDistance = effectiveLogs
      .filter((log) => log.typeId === selectedType.id && isInMonth(log.loggedForDate, calendarMonthKey))
      .reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);
    setTestOverallSessionsInput(String(totalSessions));
    setTestOverallDistanceInput(totalDistance.toFixed(1));
    setTestMonthKeyInput(calendarMonthKey);
    setTestMonthSessionsInput(String(monthSessions));
    setTestMonthDistanceInput(monthDistance.toFixed(1));
  };

  const applyTestOverallData = () => {
    if (!isTestMode || !selectedType) return;
    const sessions = Number(testOverallSessionsInput);
    const totalDistance = Number(testOverallDistanceInput);
    if (!Number.isFinite(sessions) || sessions < 0) {
      setToast("Overall sessions must be 0 or greater.");
      return;
    }
    if (!Number.isFinite(totalDistance) || totalDistance < 0) {
      setToast("Overall distance must be 0 or greater.");
      return;
    }
    const targetSessions = Math.floor(sessions);
    const todayDate = new Date();
    todayDate.setHours(12, 0, 0, 0);
    const dayKeys = Array.from({ length: targetSessions }, (_, idx) => {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - idx);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }).reverse();
    const synthetic = buildSyntheticLogsForType(selectedType.id, dayKeys, isSelectedDistanceType ? totalDistance : 0);
    const next = [...logs.filter((log) => log.typeId !== selectedType.id), ...synthetic].sort(compareLogsDesc);
    activeStore.saveActivityLogs(next);
    setLogs(next);
    setToast(`Applied overall data to ${selectedType.name}: ${targetSessions} sessions.`);
  };

  const applyTestMonthAutoFill = () => {
    if (!isTestMode || !selectedType) return;
    const sessions = Number(testMonthSessionsInput);
    const totalDistance = Number(testMonthDistanceInput);
    if (!testMonthKeyInput || !/^\d{4}-\d{2}$/.test(testMonthKeyInput)) {
      setToast("Month must be in YYYY-MM format.");
      return;
    }
    if (!Number.isFinite(sessions) || sessions < 0) {
      setToast("Month sessions must be 0 or greater.");
      return;
    }
    if (!Number.isFinite(totalDistance) || totalDistance < 0) {
      setToast("Month distance must be 0 or greater.");
      return;
    }

    const targetSessions = Math.floor(sessions);
    const monthDays = daysInMonth(testMonthKeyInput);
    const pickedDates = distributeDateKeys(monthDays, targetSessions);
    const synthetic = buildSyntheticLogsForType(selectedType.id, pickedDates, isSelectedDistanceType ? totalDistance : 0);
    const next = [
      ...logs.filter((log) => !(log.typeId === selectedType.id && isInMonth(log.loggedForDate, testMonthKeyInput))),
      ...synthetic
    ]
      .sort(compareLogsDesc);
    activeStore.saveActivityLogs(next);
    setLogs(next);
    setCalendarMonthKey(testMonthKeyInput);
    setToast(`Auto-filled ${testMonthKeyInput} for ${selectedType.name}: ${targetSessions} sessions.`);
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!isTestMode || !selectedType) return;
    const totalSessions = effectiveLogs.filter((log) => log.typeId === selectedType.id).length;
    const totalDistance = effectiveLogs
      .filter((log) => log.typeId === selectedType.id)
      .reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);
    const monthSessions = effectiveLogs.filter((log) => log.typeId === selectedType.id && isInMonth(log.loggedForDate, calendarMonthKey)).length;
    const monthDistance = effectiveLogs
      .filter((log) => log.typeId === selectedType.id && isInMonth(log.loggedForDate, calendarMonthKey))
      .reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);
    setTestOverallSessionsInput(String(totalSessions));
    setTestOverallDistanceInput(totalDistance.toFixed(1));
    setTestMonthKeyInput(calendarMonthKey);
    setTestMonthSessionsInput(String(monthSessions));
    setTestMonthDistanceInput(monthDistance.toFixed(1));
  }, [calendarMonthKey, effectiveLogs, isTestMode, selectedType]);

  useEffect(() => {
    if (xpGainModalValue === null) return;
    const id = window.setTimeout(() => setXpGainModalValue(null), 1200);
    return () => window.clearTimeout(id);
  }, [xpGainModalValue]);

  return (
    <AppShell showTitle={false}>
      <div className={`mx-auto w-full max-w-[2000px] px-4 pb-16 pt-10 ${isTestMode ? "rounded-2xl border border-emerald-300/25 bg-[rgba(16,58,52,0.12)]" : ""}`}>
        <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)_320px]">
          <div>
            <BadgeShowcasePanel logs={effectiveLogs} selectedTypeId={selectedType.id} baseDateKey={gamificationBaseDateKey} />
          </div>

          <div className="space-y-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-3xl">Health</h1>
                <div className="text-sm text-[var(--ink-1)]">
                  Workout tracker with week-specific targets and calendar logging.
                  {isTestMode ? " [TEST MODE]" : ""}
                </div>
              </div>
              <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setDebugModalOpen(true)}>
                Debug
              </button>
            </div>

            <SummaryDashboard
              weeklyTotal={weeklyTotal}
              monthlyTotal={monthlyTotal}
              currentStreak={streakStats.current}
              bestStreak={streakStats.best}
            />

            {isTestMode && selectedType ? (
              <section className="space-y-4 rounded-2xl border border-emerald-300/30 bg-[rgba(16,58,52,0.22)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.12em] text-emerald-200">Test-Only Quick Tools ({selectedType.name})</div>
                  <button className="rounded-full border border-emerald-300/70 px-3 py-1 text-xs text-emerald-200" onClick={syncTestQuickToolInputs}>
                    Sync
                  </button>
                </div>

                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-[var(--ink-1)]">Overall Data (all-time for selected activity)</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-[var(--ink-1)]">
                      Sessions
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
                        value={testOverallSessionsInput}
                        onChange={(event) => setTestOverallSessionsInput(event.target.value)}
                      />
                    </label>
                    <label className="text-xs text-[var(--ink-1)]">
                      Total KM
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        disabled={!isSelectedDistanceType}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none disabled:opacity-50"
                        value={testOverallDistanceInput}
                        onChange={(event) => setTestOverallDistanceInput(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-full border border-emerald-300/70 px-4 py-2 text-xs text-emerald-200" onClick={applyTestOverallData}>
                      Apply Overall
                    </button>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-[var(--ink-1)]">Calendar Auto Fill (replace selected month for selected activity)</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-[var(--ink-1)]">
                      Month
                      <input
                        type="month"
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
                        value={testMonthKeyInput}
                        onChange={(event) => setTestMonthKeyInput(event.target.value)}
                      />
                    </label>
                    <label className="text-xs text-[var(--ink-1)]">
                      Sessions
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
                        value={testMonthSessionsInput}
                        onChange={(event) => setTestMonthSessionsInput(event.target.value)}
                      />
                    </label>
                    <label className="text-xs text-[var(--ink-1)]">
                      Total KM
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        disabled={!isSelectedDistanceType}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none disabled:opacity-50"
                        value={testMonthDistanceInput}
                        onChange={(event) => setTestMonthDistanceInput(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-full border border-emerald-300/70 px-4 py-2 text-xs text-emerald-200" onClick={applyTestMonthAutoFill}>
                      Auto Fill Month
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <ActivityIconRow types={safeTypes} selectedTypeId={selectedTypeId} onSelect={setSelectedTypeId} />

            <ActivityInfoPanel
              selectedType={selectedType}
              selectedDateKey={selectedDateKey}
              calendarMonthKey={calendarMonthKey}
              markedDateCounts={markedDateCounts}
              weeklyCount={selectedWeeklyCount}
              weeklyTarget={selectedWeeklyTarget}
              monthlyCount={selectedMonthlyCount}
              runningWeeklyKm={selectedDistanceWeeklyKm}
              runningMonthlyKm={selectedDistanceMonthlyKm}
              recentLogs={recentLogs}
              onAddLog={() => {
                setEditingLog(null);
                setLogModalOpen(true);
              }}
              onEditTarget={() => setTargetModalOpen(true)}
              onChangePlanMode={handleChangePlanMode}
              onCalendarMonthChange={(offset) => setCalendarMonthKey((prev) => shiftMonthKey(prev, offset))}
              onCalendarDateSelect={(dateKey) => {
                setSelectedDateKey(dateKey);
                setCalendarMonthKey(monthKeyFromDateKey(dateKey));
                setEditingLog(null);
                setLogModalOpen(true);
              }}
              onOpenRunningGame={() => router.push("/running")}
              onEditLog={(log) => {
                setSelectedDateKey(log.loggedForDate);
                setCalendarMonthKey(monthKeyFromDateKey(log.loggedForDate));
                setEditingLog(log);
                setLogModalOpen(true);
              }}
              onDeleteLog={handleDeleteLog}
            />
          </div>

          <div className="hidden xl:block">
            <LevelFlamePanel logs={effectiveLogs} />
          </div>
        </div>
      </div>

      <LogEditorModal
        open={logModalOpen}
        selectedType={selectedType}
        editingLog={editingLog}
        initialDateKey={selectedDateKey}
        onClose={() => {
          setLogModalOpen(false);
          setEditingLog(null);
        }}
        onSubmit={handleCreateOrUpdateLog}
        onNotify={setToast}
      />
      <TargetEditorModal
        open={targetModalOpen}
        selectedType={selectedType}
        currentTarget={selectedType.planMode === "weekly" ? selectedWeeklyTarget : selectedType.monthlyTargetCount}
        weekLabel={weekRangeLabel(selectedWeekKey)}
        onClose={() => setTargetModalOpen(false)}
        onSave={handleSaveTarget}
        onNotify={setToast}
      />
      <PlainModal open={debugModalOpen} title="Debug" onClose={() => setDebugModalOpen(false)}>
        <div className="space-y-3 text-sm text-[var(--ink-1)]">
          <div>Current mode: {isTestMode ? "TEST" : "MAIN"}</div>
          <div className="flex flex-wrap gap-2">
            {isTestMode ? (
              <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={handleExitTestMode}>
                Exit Test Mode
              </button>
            ) : (
              <button className="rounded-full border border-[var(--accent-1)]/70 px-4 py-2 text-xs text-[var(--accent-1)]" onClick={() => setEnterTestConfirmOpen(true)}>
                Test Mode
              </button>
            )}
            {!isTestMode ? (
              <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={handleGenerateTestData}>
                Generate Test Data (Main)
              </button>
            ) : null}
            <button
              className="rounded-full border border-[var(--accent-2)]/60 px-4 py-2 text-xs text-[var(--accent-2)]"
              onClick={() => setClearMainLogsConfirmOpen(true)}
            >
              Clear Main Logs
            </button>
          </div>
        </div>
      </PlainModal>
      <PlainModal
        open={enterTestConfirmOpen}
        title="Enter Test Mode"
        onClose={() => setEnterTestConfirmOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setEnterTestConfirmOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full border border-[var(--accent-1)]/70 px-4 py-2 text-xs text-[var(--accent-1)]" onClick={handleConfirmEnterTestMode}>
              Enter
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--ink-1)]">테스트 페이지로 진입하겠습니까?</div>
      </PlainModal>
      <PlainModal
        open={clearMainLogsConfirmOpen}
        title="Clear Main Health Logs"
        onClose={() => setClearMainLogsConfirmOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setClearMainLogsConfirmOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full border border-[var(--accent-2)]/60 px-4 py-2 text-xs text-[var(--accent-2)]" onClick={handleClearMainLogs}>
              Clear
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--ink-1)]">test 저장소는 유지하고, 실제(main) 운동 로그만 모두 삭제할까요?</div>
      </PlainModal>
      <PlainModal
        open={Boolean(deletingLog)}
        title="Delete Workout Log"
        onClose={() => setDeletingLog(null)}
        actions={
          <>
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setDeletingLog(null)}>
              Cancel
            </button>
            <button className="rounded-full border border-[var(--accent-2)]/60 px-4 py-2 text-xs text-[var(--accent-2)]" onClick={confirmDeleteLog}>
              Delete
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--ink-1)]">
          {deletingLog ? `${deletingLog.loggedForDate} ${deletingLog.typeId} log를 삭제할까요?` : "로그를 삭제할까요?"}
        </div>
      </PlainModal>
      <PlainModal
        open={xpGainModalValue !== null}
        title="XP Gained"
        onClose={() => setXpGainModalValue(null)}
        panelClassName="max-w-sm"
      >
        <div className="py-6 text-center">
          <div className="text-4xl font-semibold text-[var(--accent-1)]">+{xpGainModalValue ?? 0} XP</div>
        </div>
      </PlainModal>
      {toast ? (
        <div className="fixed bottom-5 right-5 z-[1300] rounded-xl border border-white/15 bg-[#0f1824] px-4 py-2 text-sm text-[var(--ink-0)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </AppShell>
  );
}

