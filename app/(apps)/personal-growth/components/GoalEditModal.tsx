import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import type {
  Goal,
  GoalDomain,
  GoalStatus,
  GoalType,
  GoalDisplayMode,
  Importance,
  ProgressUpdate,
  TrackingMode,
  WeeklyChecklistState
} from "../types";
import { deadlineLabel } from "../lib/utils";

type Props = {
  open: boolean;
  goal: Goal | null;
  weekKey: string;
  checklistStates: WeeklyChecklistState[];
  updates: ProgressUpdate[];
  domains: GoalDomain[];
  onClose: () => void;
  onSaveGoal: (goal: Goal, previousStatus?: GoalStatus) => void;
  onDeleteGoal: (goalId: string) => void;
  onArchive: (goal: Goal) => void;
  onAddUpdate: (update: ProgressUpdate) => void;
  onDeleteUpdate: (updateId: string) => void;
  onToggleChecklist: (goalId: string, itemId: string, checked: boolean) => void;
};

const STATUS_OPTIONS: GoalStatus[] = ["NOT_STARTED", "PROGRESSING", "DONE", "PAUSED", "DROPPED"];
const IMPORTANCE_OPTIONS: Importance[] = ["LOW", "MIDDLE", "HIGH"];
const GOAL_TYPE_OPTIONS: GoalType[] = ["VALUE", "COUNT", "CHECKLIST"];
const TRACKING_MODE_OPTIONS: TrackingMode[] = ["MANUAL", "LINKED"];
const DISPLAY_MODE_OPTIONS: GoalDisplayMode[] = ["TARGET", "TRACKER"];

const SOURCE_APP_OPTIONS: Array<"HEALTH" | "ASSET" | "INVESTING" | "CAREER"> = ["HEALTH", "ASSET", "INVESTING", "CAREER"];
const SOURCE_METRIC_OPTIONS: Record<"HEALTH" | "ASSET" | "INVESTING" | "CAREER", string[]> = {
  HEALTH: ["swimmingSessions2026", "swimAttendanceThisMonth", "stepsAvg"],
  ASSET: ["netWorth"],
  INVESTING: ["monthlyContribution", "annualReturnRate"],
  CAREER: ["studyHoursWeek"]
};

function defaultLinkedSource(app: "HEALTH" | "ASSET" | "INVESTING" | "CAREER") {
  return { sourceApp: app, sourceMetric: SOURCE_METRIC_OPTIONS[app][0], displayMode: "VALUE_ONLY" as const };
}

function toFormattedNumberInput(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("ko-KR");
}

function parseNumberInput(raw: string) {
  const normalized = raw.replace(/[^0-9.-]/g, "").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function GoalEditModal({
  open,
  goal,
  weekKey,
  checklistStates,
  updates,
  domains,
  onClose,
  onSaveGoal,
  onDeleteGoal,
  onArchive,
  onAddUpdate,
  onDeleteUpdate,
  onToggleChecklist
}: Props) {
  const [draft, setDraft] = useState<Goal | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logSummary, setLogSummary] = useState("");
  const [logValue, setLogValue] = useState("");
  const [logMemo, setLogMemo] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!goal) {
      setDraft(null);
      return;
    }
    setDraft({ ...goal, links: goal.links ?? [], checklistItems: goal.checklistItems ?? [] });
    setLinkInput("");
    setChecklistText("");
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogSummary("");
    setLogValue("");
    setLogMemo("");
    setDeleteConfirmOpen(false);
    setArchiveConfirmOpen(false);
  }, [open, goal]);

  const goalUpdates = useMemo(() => {
    if (!draft) return [] as ProgressUpdate[];
    return [...updates]
      .filter((item) => item.goalId === draft.id)
      .sort((a, b) => b.loggedForDate.localeCompare(a.loggedForDate) || b.createdAt.localeCompare(a.createdAt));
  }, [draft, updates]);

  const checked = useMemo(() => {
    if (!draft) return new Set<string>();
    return new Set(checklistStates.find((entry) => entry.goalId === draft.id && entry.weekKey === weekKey)?.checkedItemIds ?? []);
  }, [checklistStates, draft, weekKey]);

  if (!draft) return null;

  const ddayText = deadlineLabel(draft.deadline);

  return (
    <>
      <Modal
        open={open}
        title={goal ? "Edit Goal" : "Add Goal"}
        onClose={onClose}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[980px]"
        actions={
          <>
            {goal ? (
              <div className="flex items-center gap-2">
                <button className="rounded-full border border-amber-300/50 px-4 py-2 text-xs text-amber-300" onClick={() => setArchiveConfirmOpen(true)}>
                  Archive
                </button>
                <button className="rounded-full border border-rose-400/50 px-4 py-2 text-xs text-rose-300" onClick={() => setDeleteConfirmOpen(true)}>
                  Delete Goal
                </button>
              </div>
            ) : null}
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={onClose}>Cancel</button>
            <button
              className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300"
              onClick={() => {
                if (!draft.title.trim()) return;
                onSaveGoal({ ...draft, title: draft.title.trim() }, goal?.status);
                onClose();
              }}
            >
              Apply
            </button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Domain
            <select
              value={draft.domainId}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, domainId: event.target.value } : prev))}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Scope
            <select
              value={draft.scope}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, scope: event.target.value as Goal["scope"] } : prev))}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              <option value="WEEKLY">WEEKLY</option>
              <option value="MONTHLY">MONTHLY</option>
              <option value="YEARLY">YEARLY</option>
              <option value="LIFETIME">LIFETIME</option>
            </select>
          </label>
        </div>

        <label className="block text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
          Title
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Goal Type
            <select
              value={draft.goalType}
              onChange={(event) => {
                const nextType = event.target.value as GoalType;
                setDraft((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    goalType: nextType,
                    displayMode: nextType === "COUNT" ? "TRACKER" : prev.displayMode,
                    metric: nextType === "VALUE" ? prev.metric ?? { unit: "" } : undefined,
                    countMetric: nextType === "COUNT" ? prev.countMetric ?? { countTarget: 1, period: "WEEK", unitLabel: "times" } : undefined,
                    checklistItems: nextType === "CHECKLIST" ? prev.checklistItems ?? [] : undefined
                  };
                });
              }}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {GOAL_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Importance
            <select
              value={draft.importance}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, importance: event.target.value as Importance } : prev))}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {IMPORTANCE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Status
            <select
              value={draft.status}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, status: event.target.value as GoalStatus } : prev))}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Tracking Mode
            <select
              value={draft.trackingMode}
              onChange={(event) => {
                const mode = event.target.value as TrackingMode;
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        trackingMode: mode,
                        linkedSource: mode === "LINKED" ? prev.linkedSource ?? defaultLinkedSource("HEALTH") : undefined
                      }
                    : prev
                );
              }}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {TRACKING_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Display Mode
            <select
              value={draft.displayMode}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, displayMode: event.target.value as GoalDisplayMode } : prev))}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {DISPLAY_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>

          {draft.trackingMode === "LINKED" ? (
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Linked App
              <select
                value={draft.linkedSource?.sourceApp ?? "HEALTH"}
                onChange={(event) => {
                  const app = event.target.value as "HEALTH" | "ASSET" | "INVESTING" | "CAREER";
                  setDraft((prev) => (prev ? { ...prev, linkedSource: defaultLinkedSource(app) } : prev));
                }}
                className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              >
                {SOURCE_APP_OPTIONS.map((app) => (
                  <option key={app} value={app}>{app}</option>
                ))}
              </select>
            </label>
          ) : (
            <div />
          )}
        </div>

        {draft.trackingMode === "LINKED" ? (
          <label className="block text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Linked Metric
            <select
              value={draft.linkedSource?.sourceMetric ?? SOURCE_METRIC_OPTIONS.HEALTH[0]}
              onChange={(event) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        linkedSource: {
                          ...(prev.linkedSource ?? defaultLinkedSource("HEALTH")),
                          sourceMetric: event.target.value
                        }
                      }
                    : prev
                )
              }
              className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            >
              {(draft.linkedSource ? SOURCE_METRIC_OPTIONS[draft.linkedSource.sourceApp] : SOURCE_METRIC_OPTIONS.HEALTH).map((metric) => (
                <option key={metric} value={metric}>{metric}</option>
              ))}
            </select>
          </label>
        ) : null}

        {draft.goalType === "VALUE" ? (
          <div className="grid gap-4 md:grid-cols-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Unit
              <input
                value={draft.metric?.unit ?? ""}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, metric: { ...(prev.metric ?? {}), unit: event.target.value } } : prev))}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Start Value
              <input
                value={toFormattedNumberInput(draft.metric?.startValue)}
                onChange={(event) =>
                  setDraft((prev) => {
                    if (!prev) return prev;
                    return { ...prev, metric: { ...(prev.metric ?? { unit: "" }), startValue: parseNumberInput(event.target.value) } };
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Target Value
              <input
                value={toFormattedNumberInput(draft.metric?.targetValue)}
                onChange={(event) =>
                  setDraft((prev) => {
                    if (!prev) return prev;
                    return { ...prev, metric: { ...(prev.metric ?? { unit: "" }), targetValue: parseNumberInput(event.target.value) } };
                  })
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
        ) : null}

        {draft.goalType === "COUNT" ? (
          <div className="grid gap-4 md:grid-cols-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Count Target
              <input
                value={toFormattedNumberInput(draft.countMetric?.countTarget ?? 1)}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, countMetric: { ...(prev.countMetric ?? { period: "WEEK", unitLabel: "times" }), countTarget: parseNumberInput(event.target.value) ?? 1 } }
                      : prev
                  )
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Period
              <select
                value={draft.countMetric?.period ?? "WEEK"}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, countMetric: { ...(prev.countMetric ?? { countTarget: 1, unitLabel: "times" }), period: event.target.value as "WEEK" | "MONTH" | "YEAR" | "CUSTOM_RANGE" } }
                      : prev
                  )
                }
                className="lifnux-select mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              >
                <option value="WEEK">WEEK</option>
                <option value="MONTH">MONTH</option>
                <option value="YEAR">YEAR</option>
                <option value="CUSTOM_RANGE">CUSTOM_RANGE</option>
              </select>
            </label>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
              Unit Label
              <input
                value={draft.countMetric?.unitLabel ?? "times"}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? { ...prev, countMetric: { ...(prev.countMetric ?? { countTarget: 1, period: "WEEK" }), unitLabel: event.target.value } }
                      : prev
                  )
                }
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Deadline
            <input type="date" value={draft.deadline ?? ""} onChange={(event) => setDraft((prev) => (prev ? { ...prev, deadline: event.target.value || undefined } : prev))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
            <div className="mt-1 text-[11px] text-cyan-300">{ddayText}</div>
            <div className="text-[11px] text-[var(--ink-1)]">{draft.deadline ?? "-"}</div>
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Start Date
            <input type="date" value={draft.startDate ?? ""} onChange={(event) => setDraft((prev) => (prev ? { ...prev, startDate: event.target.value || undefined } : prev))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Details
            <textarea rows={3} value={draft.details} onChange={(event) => setDraft((prev) => (prev ? { ...prev, details: event.target.value } : prev))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">
            Notes
            <textarea rows={3} value={draft.notes} onChange={(event) => setDraft((prev) => (prev ? { ...prev, notes: event.target.value } : prev))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Current Status Logs</div>
          <div className="grid gap-2 md:grid-cols-4">
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" />
            <input value={logSummary} onChange={(e) => setLogSummary(e.target.value)} placeholder="summary" className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white md:col-span-2" />
            <input value={logValue} onChange={(e) => {
              const parsed = parseNumberInput(e.target.value);
              setLogValue(typeof parsed === "number" ? parsed.toLocaleString("ko-KR") : "");
            }} placeholder={draft.goalType === "CHECKLIST" ? "N/A for checklist" : "value (optional)"} disabled={draft.goalType === "CHECKLIST"} className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white disabled:opacity-40" />
          </div>
          <div className="mt-2 flex gap-2">
            <input value={logMemo} onChange={(e) => setLogMemo(e.target.value)} placeholder="memo (optional)" className="flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" />
            <button
              className="rounded-full border border-cyan-300/40 px-3 py-1 text-xs text-cyan-300"
              onClick={() => {
                if (!logSummary.trim()) return;
                const parsed = parseNumberInput(logValue);
                onAddUpdate({
                  id: crypto.randomUUID(),
                  goalId: draft.id,
                  loggedForDate: logDate,
                  summary: logSummary.trim(),
                  value: draft.goalType === "CHECKLIST" ? undefined : parsed,
                  memo: logMemo.trim() || undefined,
                  createdAt: new Date().toISOString()
                });
                setLogSummary("");
                setLogValue("");
                setLogMemo("");
              }}
            >
              Add Log
            </button>
          </div>

          <div className="mt-3 max-h-[180px] space-y-2 overflow-y-auto pr-1">
            {goalUpdates.length ? (
              goalUpdates.map((u) => (
                <div key={u.id} className="flex items-start justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--ink-1)]">{u.loggedForDate}</div>
                    <div className="truncate text-sm text-white">{u.summary}</div>
                    {typeof u.value === "number" ? <div className="text-xs text-cyan-300">{u.value.toLocaleString("ko-KR")}</div> : null}
                  </div>
                  <button className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] text-rose-300" onClick={() => onDeleteUpdate(u.id)}>Delete</button>
                </div>
              ))
            ) : (
              <div className="text-xs text-[var(--ink-1)]">No logs.</div>
            )}
          </div>
        </div>

        {draft.goalType === "CHECKLIST" ? (
          <div className="rounded-xl border border-white/10 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Checklist</div>
            <div className="flex gap-2">
              <input value={checklistText} onChange={(e) => setChecklistText(e.target.value)} className="flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" placeholder="new checklist item" />
              <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => {
                if (!checklistText.trim()) return;
                const item = { id: crypto.randomUUID(), text: checklistText.trim(), order: (draft.checklistItems ?? []).length };
                setDraft((prev) => (prev ? { ...prev, checklistItems: [...(prev.checklistItems ?? []), item] } : prev));
                setChecklistText("");
              }}>Add Item</button>
            </div>
            <div className="mt-2 space-y-2">
              {(draft.checklistItems ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-2 py-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={checked.has(item.id)} onChange={(e) => onToggleChecklist(draft.id, item.id, e.target.checked)} />
                    <span>{item.text}</span>
                  </label>
                  <button className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] text-rose-300" onClick={() => setDraft((prev) => (prev ? { ...prev, checklistItems: (prev.checklistItems ?? []).filter((x) => x.id !== item.id) } : prev))}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/10 p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Links</div>
          <div className="flex gap-2">
            <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} className="flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" placeholder="https://..." />
            <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => {
              if (!linkInput.trim()) return;
              setDraft((prev) => (prev ? { ...prev, links: [...prev.links, linkInput.trim()] } : prev));
              setLinkInput("");
            }}>Add Link</button>
          </div>
          <div className="mt-2 space-y-1">
            {draft.links.map((link) => (
              <div key={link} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-2 py-1">
                <span className="truncate text-xs text-cyan-300">{link}</span>
                <button className="rounded-full border border-rose-400/40 px-2 py-1 text-[11px] text-rose-300" onClick={() => setDraft((prev) => (prev ? { ...prev, links: prev.links.filter((x) => x !== link) } : prev))}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={archiveConfirmOpen}
        title="Archive Goal"
        description="이 목표를 ARCHIVE에 복제하시겠습니까?"
        detail="현재 목표는 유지되고, ARCHIVE에 사본이 생성됩니다."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => {
          onArchive(draft);
          setArchiveConfirmOpen(false);
        }}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete Goal"
        description="이 목표를 삭제하시겠습니까?"
        detail="목표와 연결된 로그/체크리스트 상태도 함께 삭제됩니다."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          onDeleteGoal(draft.id);
          setDeleteConfirmOpen(false);
          onClose();
        }}
      />
    </>
  );
}
