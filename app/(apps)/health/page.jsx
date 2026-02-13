"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { ActivityIconRow } from "./components/ActivityIconRow";
import { ActivityInfoPanel } from "./components/ActivityInfoPanel";
import { BadgeShowcasePanel, LevelFlamePanel } from "./components/GamificationSidePanels";
import { LogEditorModal } from "./components/LogEditorModal";
import { PlainModal } from "./components/PlainModal";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { TargetEditorModal } from "./components/TargetEditorModal";
import { calculateLogXP, calculateStreak } from "./lib/gamification";
import { isInMonth, isInWeek, monthGridFromMonthKey, monthKeyFromDateKey, shiftMonthKey, todayDateKey, weekKeyFromDateKey, weekRangeLabel } from "./lib/date";
import { generateHealthTestLogs } from "./lib/seed";
import { healthStore } from "./lib/store";
function compareLogsDesc(a, b) {
    if (a.loggedForDate !== b.loggedForDate)
        return b.loggedForDate.localeCompare(a.loggedForDate);
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
        tennis: 0
    };
}
function countByTypeInWeek(logs, weekKey) {
    const counts = emptyCountRecord();
    for (const log of logs) {
        if (isInWeek(log.loggedForDate, weekKey))
            counts[log.typeId] += 1;
    }
    return counts;
}
function countByTypeInMonth(logs, monthKey) {
    const counts = emptyCountRecord();
    for (const log of logs) {
        if (isInMonth(log.loggedForDate, monthKey))
            counts[log.typeId] += 1;
    }
    return counts;
}
export default function HealthPage() {
    const router = useRouter();
    const today = todayDateKey();
    const [types, setTypes] = useState([]);
    const [logs, setLogs] = useState([]);
    const [weeklyTargets, setWeeklyTargets] = useState([]);
    const [selectedTypeId, setSelectedTypeId] = useState("running");
    const [selectedDateKey, setSelectedDateKey] = useState(today);
    const [calendarMonthKey, setCalendarMonthKey] = useState(monthKeyFromDateKey(today));
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [targetModalOpen, setTargetModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState(null);
    const [deletingLog, setDeletingLog] = useState(null);
    const [xpGainModalValue, setXpGainModalValue] = useState(null);
    const [toast, setToast] = useState(null);
    useEffect(() => {
        setTypes(healthStore.loadActivityTypes());
        setLogs(healthStore.loadActivityLogs());
        setWeeklyTargets(healthStore.loadWeeklyTargets());
    }, []);
    useEffect(() => {
        if (!types.length)
            return;
        if (!types.some((item) => item.id === selectedTypeId))
            setSelectedTypeId(types[0].id);
    }, [types, selectedTypeId]);
    const selectedType = useMemo(() => types.find((item) => item.id === selectedTypeId) ?? types[0], [types, selectedTypeId]);
    const currentWeekKey = weekKeyFromDateKey(today);
    const currentMonthKey = monthKeyFromDateKey(today);
    const selectedWeekKey = weekKeyFromDateKey(selectedDateKey);
    const selectedMonthKey = monthKeyFromDateKey(selectedDateKey);
    const weeklyCountsSelected = useMemo(() => countByTypeInWeek(logs, selectedWeekKey), [logs, selectedWeekKey]);
    const monthlyCountsSelected = useMemo(() => countByTypeInMonth(logs, selectedMonthKey), [logs, selectedMonthKey]);
    const weeklyTotal = useMemo(() => logs.filter((item) => isInWeek(item.loggedForDate, currentWeekKey)).length, [logs, currentWeekKey]);
    const monthlyTotal = useMemo(() => logs.filter((item) => isInMonth(item.loggedForDate, currentMonthKey)).length, [logs, currentMonthKey]);
    const selectedDistanceWeeklyKm = useMemo(() => {
        return logs
            .filter((item) => (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle") &&
            item.typeId === selectedTypeId &&
            isInWeek(item.loggedForDate, selectedWeekKey))
            .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
    }, [logs, selectedTypeId, selectedWeekKey]);
    const selectedDistanceMonthlyKm = useMemo(() => {
        return logs
            .filter((item) => (item.typeId === "running" || item.typeId === "walking" || item.typeId === "bicycle") &&
            item.typeId === selectedTypeId &&
            isInMonth(item.loggedForDate, selectedMonthKey))
            .reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
    }, [logs, selectedTypeId, selectedMonthKey]);
    const streakStats = useMemo(() => calculateStreak(logs), [logs]);
    const selectedWeeklyTarget = useMemo(() => {
        if (!selectedType)
            return 0;
        const override = weeklyTargets.find((item) => item.typeId === selectedType.id && item.weekKey === selectedWeekKey);
        return override ? override.targetCount : selectedType.weeklyTargetCount;
    }, [selectedType, selectedWeekKey, weeklyTargets]);
    const selectedWeeklyCount = selectedType ? weeklyCountsSelected[selectedType.id] : 0;
    const selectedMonthlyCount = selectedType ? monthlyCountsSelected[selectedType.id] : 0;
    const recentLogs = useMemo(() => {
        if (!selectedType)
            return [];
        return logs.filter((item) => item.typeId === selectedType.id).sort(compareLogsDesc).slice(0, 5);
    }, [logs, selectedType]);
    const markedDateCounts = useMemo(() => {
        if (!selectedType)
            return {};
        const visible = new Set(monthGridFromMonthKey(calendarMonthKey).map((cell) => cell.dateKey));
        const result = {};
        for (const log of logs) {
            if (log.typeId !== selectedType.id)
                continue;
            if (!visible.has(log.loggedForDate))
                continue;
            result[log.loggedForDate] = (result[log.loggedForDate] ?? 0) + 1;
        }
        return result;
    }, [logs, selectedType, calendarMonthKey]);
    const handleCreateOrUpdateLog = (draft) => {
        if (editingLog) {
            const updated = healthStore.updateActivityLog(editingLog.id, draft);
            if (!updated) {
                setToast("Unable to update the log.");
                return;
            }
            setLogs(healthStore.loadActivityLogs());
            setToast("Workout log updated.");
            setEditingLog(null);
            setLogModalOpen(false);
            return;
        }
        healthStore.createActivityLog(draft);
        setLogs(healthStore.loadActivityLogs());
        setXpGainModalValue(calculateLogXP(draft));
        setToast(null);
        setLogModalOpen(false);
    };
    const handleDeleteLog = (log) => {
        setDeletingLog(log);
    };
    const confirmDeleteLog = () => {
        if (!deletingLog)
            return;
        healthStore.deleteActivityLog(deletingLog.id);
        setDeletingLog(null);
        setLogs(healthStore.loadActivityLogs());
        setToast("Workout log deleted.");
    };
    const handleSaveTarget = (nextTarget) => {
        if (!selectedType || selectedType.planMode === "unplanned")
            return;
        if (selectedType.planMode === "weekly") {
            setWeeklyTargets(healthStore.upsertWeeklyTarget(selectedType.id, selectedWeekKey, nextTarget));
            setTargetModalOpen(false);
            setToast(`Weekly target saved for ${weekRangeLabel(selectedWeekKey)}.`);
            return;
        }
        setTypes(healthStore.updateTarget(selectedType.id, selectedType.planMode, nextTarget));
        setTargetModalOpen(false);
        setToast("Monthly target saved.");
    };
    const handleChangePlanMode = (planMode) => {
        if (!selectedType)
            return;
        setTypes(healthStore.updatePlanMode(selectedType.id, planMode));
        setToast(`${selectedType.name} mode changed to ${planMode}.`);
    };
    const handleGenerateTestData = () => {
        const ok = window.confirm("Generate realistic test logs for the last 8 weeks? Existing health logs will be replaced.");
        if (!ok)
            return;
        const generated = generateHealthTestLogs();
        healthStore.saveActivityLogs(generated);
        setLogs(generated);
        setToast(`Generated ${generated.length} test logs.`);
    };
    useEffect(() => {
        if (!toast)
            return;
        const id = window.setTimeout(() => setToast(null), 2200);
        return () => window.clearTimeout(id);
    }, [toast]);
    useEffect(() => {
        if (xpGainModalValue === null)
            return;
        const id = window.setTimeout(() => setXpGainModalValue(null), 1200);
        return () => window.clearTimeout(id);
    }, [xpGainModalValue]);
    if (!selectedType) {
        return (<AppShell showTitle={false}>
        <div className="mx-auto w-full max-w-[1200px] py-10 text-sm text-[var(--ink-1)]">Loading Health app...</div>
      </AppShell>);
    }
    return (<AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[2000px] px-4 pb-16 pt-10">
        <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)_320px]">
          <div className="hidden xl:block">
            <BadgeShowcasePanel logs={logs} selectedTypeId={selectedType.id}/>
          </div>

          <div className="space-y-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-3xl">Health</h1>
                <div className="text-sm text-[var(--ink-1)]">Workout tracker with week-specific targets and calendar logging.</div>
              </div>
              {process.env.NODE_ENV !== "production" ? (<button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={handleGenerateTestData}>
                  Generate Test Data
                </button>) : null}
            </div>

            <SummaryDashboard weeklyTotal={weeklyTotal} monthlyTotal={monthlyTotal} currentStreak={streakStats.current} bestStreak={streakStats.best}/>

            <ActivityIconRow types={types} selectedTypeId={selectedTypeId} onSelect={setSelectedTypeId}/>

            <ActivityInfoPanel selectedType={selectedType} selectedDateKey={selectedDateKey} calendarMonthKey={calendarMonthKey} markedDateCounts={markedDateCounts} weeklyCount={selectedWeeklyCount} weeklyTarget={selectedWeeklyTarget} monthlyCount={selectedMonthlyCount} runningWeeklyKm={selectedDistanceWeeklyKm} runningMonthlyKm={selectedDistanceMonthlyKm} recentLogs={recentLogs} onAddLog={() => {
                setEditingLog(null);
                setLogModalOpen(true);
            }} onEditTarget={() => setTargetModalOpen(true)} onChangePlanMode={handleChangePlanMode} onCalendarMonthChange={(offset) => setCalendarMonthKey((prev) => shiftMonthKey(prev, offset))} onCalendarDateSelect={(dateKey) => {
                setSelectedDateKey(dateKey);
                setCalendarMonthKey(monthKeyFromDateKey(dateKey));
                setEditingLog(null);
                setLogModalOpen(true);
            }} onOpenRunningGame={() => router.push("/running")} onEditLog={(log) => {
                setSelectedDateKey(log.loggedForDate);
                setCalendarMonthKey(monthKeyFromDateKey(log.loggedForDate));
                setEditingLog(log);
                setLogModalOpen(true);
            }} onDeleteLog={handleDeleteLog}/>
          </div>

          <div className="hidden xl:block">
            <LevelFlamePanel logs={logs}/>
          </div>
        </div>
      </div>

      <LogEditorModal open={logModalOpen} selectedType={selectedType} editingLog={editingLog} initialDateKey={selectedDateKey} onClose={() => {
            setLogModalOpen(false);
            setEditingLog(null);
        }} onSubmit={handleCreateOrUpdateLog} onNotify={setToast}/>
      <TargetEditorModal open={targetModalOpen} selectedType={selectedType} currentTarget={selectedType.planMode === "weekly" ? selectedWeeklyTarget : selectedType.monthlyTargetCount} weekLabel={weekRangeLabel(selectedWeekKey)} onClose={() => setTargetModalOpen(false)} onSave={handleSaveTarget} onNotify={setToast}/>
      <PlainModal open={Boolean(deletingLog)} title="Delete Workout Log" onClose={() => setDeletingLog(null)} actions={<>
            <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={() => setDeletingLog(null)}>
              Cancel
            </button>
            <button className="rounded-full border border-[var(--accent-2)]/60 px-4 py-2 text-xs text-[var(--accent-2)]" onClick={confirmDeleteLog}>
              Delete
            </button>
          </>}>
        <div className="text-sm text-[var(--ink-1)]">
          {deletingLog ? `${deletingLog.loggedForDate} ${deletingLog.typeId} log를 삭제할까요?` : "로그를 삭제할까요?"}
        </div>
      </PlainModal>
      <PlainModal open={xpGainModalValue !== null} title="XP Gained" onClose={() => setXpGainModalValue(null)} panelClassName="max-w-sm">
        <div className="py-6 text-center">
          <div className="text-4xl font-semibold text-[var(--accent-1)]">+{xpGainModalValue ?? 0} XP</div>
        </div>
      </PlainModal>
      {toast ? (<div className="fixed bottom-5 right-5 z-[1300] rounded-xl border border-white/15 bg-[#0f1824] px-4 py-2 text-sm text-[var(--ink-0)] shadow-lg">
          {toast}
        </div>) : null}
    </AppShell>);
}
