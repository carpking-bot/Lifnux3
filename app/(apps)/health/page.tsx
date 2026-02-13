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
  dateKeyFromDate,
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
const TEST_DIRECT_KEY = "lifnux.health.debug.direct.v1";

type TestDirectState = {
  distanceKm: number;
  distanceSessions: number;
  countSessions: number;
};

const DEFAULT_TEST_DIRECT: TestDirectState = {
  distanceKm: 12,
  distanceSessions: 3,
  countSessions: 8
};

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

function buildDebugVirtualLogs(direct: TestDirectState): ActivityLog[] {
  const result: ActivityLog[] = [];
  const today = new Date();

  const distanceSessionCount = direct.distanceSessions > 0 ? direct.distanceSessions : direct.distanceKm > 0 ? 1 : 0;
  const perSessionKm = distanceSessionCount > 0 ? direct.distanceKm / distanceSessionCount : 0;
  for (let i = 0; i < distanceSessionCount; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateKey = dateKeyFromDate(date);
    result.push({
      id: `debug-distance-${i}`,
      typeId: "test_distance",
      loggedForDate: dateKey,
      durationMin: 35,
      distanceKm: Number(perSessionKm.toFixed(2)),
      memo: "Debug direct data",
      createdAt: `${dateKey}T12:00:00.000Z`
    });
  }

  for (let i = 0; i < direct.countSessions; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateKey = dateKeyFromDate(date);
    result.push({
      id: `debug-count-${i}`,
      typeId: "test_count",
      loggedForDate: dateKey,
      durationMin: 30,
      memo: "Debug direct data",
      createdAt: `${dateKey}T12:00:00.000Z`
    });
  }

  return result;
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
  const today = todayDateKey();
  const [isTestMode, setIsTestMode] = useState(false);

  const [types, setTypes] = useState<ActivityType[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [weeklyTargets, setWeeklyTargets] = useState<ActivityWeeklyTarget[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<ActivityTypeId>("running");
  const [selectedDateKey, setSelectedDateKey] = useState(today);
  const [calendarMonthKey, setCalendarMonthKey] = useState(monthKeyFromDateKey(today));
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<ActivityLog | null>(null);
  const [deletingLog, setDeletingLog] = useState<ActivityLog | null>(null);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const [enterTestConfirmOpen, setEnterTestConfirmOpen] = useState(false);
  const [clearMainLogsConfirmOpen, setClearMainLogsConfirmOpen] = useState(false);
  const [directEditorOpen, setDirectEditorOpen] = useState(false);
  const [testDirect, setTestDirect] = useState<TestDirectState>(DEFAULT_TEST_DIRECT);
  const [directDistanceKm, setDirectDistanceKm] = useState(String(DEFAULT_TEST_DIRECT.distanceKm));
  const [directDistanceSessions, setDirectDistanceSessions] = useState(String(DEFAULT_TEST_DIRECT.distanceSessions));
  const [directCountSessions, setDirectCountSessions] = useState(String(DEFAULT_TEST_DIRECT.countSessions));
  const [xpGainModalValue, setXpGainModalValue] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeStore = useMemo(() => createHealthStore(isTestMode ? "test" : "main"), [isTestMode]);

  useEffect(() => {
    setIsTestMode(loadState<boolean>(TEST_MODE_KEY, false));
  }, []);

  useEffect(() => {
    setTypes(activeStore.loadActivityTypes());
    setLogs(activeStore.loadActivityLogs());
    setWeeklyTargets(activeStore.loadWeeklyTargets());
  }, [activeStore]);

  useEffect(() => {
    if (!isTestMode) return;
    setTestDirect(loadState<TestDirectState>(TEST_DIRECT_KEY, DEFAULT_TEST_DIRECT));
  }, [isTestMode]);

  useEffect(() => {
    if (!isTestMode) return;
    saveState(TEST_DIRECT_KEY, testDirect);
  }, [isTestMode, testDirect]);

  useEffect(() => {
    saveState(TEST_MODE_KEY, isTestMode);
    if (!isTestMode) return;
    setSelectedTypeId("test_distance");
    setSelectedDateKey(todayDateKey());
    setCalendarMonthKey(monthKeyFromDateKey(todayDateKey()));
  }, [isTestMode]);

  useEffect(() => {
    if (!types.length) return;
    if (!types.some((item) => item.id === selectedTypeId)) setSelectedTypeId(types[0].id);
  }, [types, selectedTypeId]);

  const effectiveLogs = useMemo(() => (isTestMode ? buildDebugVirtualLogs(testDirect) : logs), [isTestMode, logs, testDirect]);
  const selectedType = useMemo(() => types.find((item) => item.id === selectedTypeId) ?? types[0], [types, selectedTypeId]);

  const currentWeekKey = weekKeyFromDateKey(today);
  const currentMonthKey = monthKeyFromDateKey(today);
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
          (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle" || item.typeId === "test_distance") &&
          item.typeId === selectedTypeId &&
          isInWeek(item.loggedForDate, selectedWeekKey)
      )
      .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
  }, [effectiveLogs, selectedTypeId, selectedWeekKey]);

  const selectedDistanceMonthlyKm = useMemo(() => {
    return effectiveLogs
      .filter(
        (item) =>
          (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle" || item.typeId === "test_distance") &&
          item.typeId === selectedTypeId &&
          isInMonth(item.loggedForDate, selectedMonthKey)
      )
      .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
  }, [effectiveLogs, selectedTypeId, selectedMonthKey]);

  const streakStats = useMemo(() => calculateStreak(effectiveLogs), [effectiveLogs]);

  const selectedWeeklyTarget = useMemo(() => {
    if (!selectedType) return 0;
    const override = weeklyTargets.find((item) => item.typeId === selectedType.id && item.weekKey === selectedWeekKey);
    return override ? override.targetCount : selectedType.weeklyTargetCount;
  }, [selectedType, selectedWeekKey, weeklyTargets]);

  const selectedWeeklyCount = selectedType ? weeklyCountsSelected[selectedType.id] : 0;
  const selectedMonthlyCount = selectedType ? monthlyCountsSelected[selectedType.id] : 0;

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
    if (isTestMode) {
      setToast("Test mode에서는 Direct Edit로 수치만 수정합니다.");
      setLogModalOpen(false);
      return;
    }
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
    if (isTestMode) return;
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
    if (isTestMode) {
      setToast("Test mode에서는 plan mode 변경을 잠시 비활성화했습니다.");
      return;
    }
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

  const openDirectEditor = () => {
    setDirectDistanceKm(String(testDirect.distanceKm));
    setDirectDistanceSessions(String(testDirect.distanceSessions));
    setDirectCountSessions(String(testDirect.countSessions));
    setDirectEditorOpen(true);
  };

  const saveDirectEditor = () => {
    const distanceKm = Number(directDistanceKm);
    const distanceSessions = Number(directDistanceSessions);
    const countSessions = Number(directCountSessions);

    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      setToast("Distance km must be >= 0.");
      return;
    }
    if (!Number.isFinite(distanceSessions) || distanceSessions < 0) {
      setToast("Distance sessions must be >= 0.");
      return;
    }
    if (!Number.isFinite(countSessions) || countSessions < 0) {
      setToast("Count sessions must be >= 0.");
      return;
    }

    setTestDirect({
      distanceKm,
      distanceSessions: Math.floor(distanceSessions),
      countSessions: Math.floor(countSessions)
    });
    setDirectEditorOpen(false);
    setToast("Debug direct values saved.");
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (xpGainModalValue === null) return;
    const id = window.setTimeout(() => setXpGainModalValue(null), 1200);
    return () => window.clearTimeout(id);
  }, [xpGainModalValue]);

  if (!selectedType) {
    return (
      <AppShell showTitle={false}>
        <div className="mx-auto w-full max-w-[1200px] py-10 text-sm text-[var(--ink-1)]">Loading Health app...</div>
      </AppShell>
    );
  }

  return (
    <AppShell showTitle={false}>
      <div className={`mx-auto w-full max-w-[2000px] px-4 pb-16 pt-10 ${isTestMode ? "rounded-2xl border border-emerald-300/25 bg-[rgba(16,58,52,0.12)]" : ""}`}>
        <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)_320px]">
          <div className="hidden xl:block">
            <BadgeShowcasePanel logs={effectiveLogs} selectedTypeId={selectedType.id} />
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

            <ActivityIconRow types={types} selectedTypeId={selectedTypeId} onSelect={setSelectedTypeId} />

            <ActivityInfoPanel
              selectedType={selectedType}
              isTestMode={isTestMode}
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
                if (isTestMode) {
                  openDirectEditor();
                  return;
                }
                setEditingLog(null);
                setLogModalOpen(true);
              }}
              onEditTarget={() => setTargetModalOpen(true)}
              onChangePlanMode={handleChangePlanMode}
              onCalendarMonthChange={(offset) => setCalendarMonthKey((prev) => shiftMonthKey(prev, offset))}
              onCalendarDateSelect={(dateKey) => {
                setSelectedDateKey(dateKey);
                setCalendarMonthKey(monthKeyFromDateKey(dateKey));
                if (isTestMode) return;
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
              onOpenDirectEdit={openDirectEditor}
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
        open={directEditorOpen}
        title="Test Direct Editor"
        onClose={() => setDirectEditorOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setDirectEditorOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={saveDirectEditor}>
              Save
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--ink-1)]">
            Distance Total (km)
            <input
              type="number"
              min={0}
              step="0.1"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
              value={directDistanceKm}
              onChange={(event) => setDirectDistanceKm(event.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--ink-1)]">
            Distance Sessions
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
              value={directDistanceSessions}
              onChange={(event) => setDirectDistanceSessions(event.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--ink-1)] sm:col-span-2">
            Count Sessions
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none"
              value={directCountSessions}
              onChange={(event) => setDirectCountSessions(event.target.value)}
            />
          </label>
        </div>
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

