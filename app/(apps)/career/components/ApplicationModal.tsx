import { useEffect, useState } from "react";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Modal } from "../../../(shared)/components/Modal";
import { autoDoneOnFinal, stageLabel } from "../lib/stageHelpers";
import type { Application, JobPosting, Stage, StageResult, StageType } from "../types";

type Props = {
  open: boolean;
  application: Application | null;
  posting: JobPosting | null;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (next: Application) => void;
  onReopen: (applicationId: string) => void;
};

const TYPE_OPTIONS: StageType[] = ["DOCUMENT", "INTERVIEW_1", "INTERVIEW_2", "FINAL", "CUSTOM"];
const RESULT_OPTIONS: StageResult[] = ["PENDING", "PASS", "FAIL"];

export function ApplicationModal({ open, application, posting, readOnly, onClose, onSave, onReopen }: Props) {
  const [draft, setDraft] = useState<Application | null>(null);
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [pendingRemoveStageId, setPendingRemoveStageId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(application ? { ...application, stages: application.stages.map((stage) => ({ ...stage })) } : null);
    setNewCustomLabel("");
    setPendingRemoveStageId(null);
  }, [open, application]);

  if (!draft) return null;

  const updateStage = (stageId: string, patch: Partial<Stage>) => {
    const next = {
      ...draft,
      stages: draft.stages.map((stage) => (stage.stageId === stageId ? { ...stage, ...patch } : stage))
    };
    setDraft(autoDoneOnFinal(next));
  };

  const moveStage = (stageId: string, direction: "up" | "down") => {
    const idx = draft.stages.findIndex((stage) => stage.stageId === stageId);
    if (idx < 0) return;
    const to = direction === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= draft.stages.length) return;
    const next = [...draft.stages];
    const tmp = next[idx];
    next[idx] = next[to];
    next[to] = tmp;
    setDraft({ ...draft, stages: next });
  };

  const removeStage = (stageId: string) => {
    setDraft((prev) => (prev ? autoDoneOnFinal({ ...prev, stages: prev.stages.filter((stage) => stage.stageId !== stageId) }) : prev));
  };

  return (
    <>
      <Modal
        open={open}
        title={`Application · ${posting?.companyName ?? "Unknown"}`}
        onClose={onClose}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[960px]"
        actions={
          <>
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={onClose}>Close</button>
            {readOnly ? (
              <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={() => onReopen(draft.applicationId)}>Reopen</button>
            ) : (
              <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={() => onSave(draft)}>Save</button>
            )}
          </>
        }
      >
        <div className="text-xs text-[var(--ink-1)]">{posting?.postingTitle ?? "Missing posting"} · Applied {draft.appliedAt}</div>
        <div className="text-xs text-[var(--ink-1)]">Status: {draft.status} / Final: {draft.finalResult ?? "-"}</div>

        <div className="space-y-2">
          {draft.stages.map((stage, idx) => (
            <div key={stage.stageId} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="text-sm text-white">{idx + 1}. {stageLabel(stage)}</div>
                {!readOnly ? (
                  <>
                    <button className="rounded-full border border-white/20 px-2 py-0.5 text-[10px]" onClick={() => moveStage(stage.stageId, "up")}>Up</button>
                    <button className="rounded-full border border-white/20 px-2 py-0.5 text-[10px]" onClick={() => moveStage(stage.stageId, "down")}>Down</button>
                    <button className="rounded-full border border-rose-400/50 px-2 py-0.5 text-[10px] text-rose-300" onClick={() => setPendingRemoveStageId(stage.stageId)}>Remove</button>
                  </>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" value={stage.type} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { type: e.target.value as StageType })}>
                  {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <input className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" placeholder="Custom label" value={stage.customLabel ?? ""} disabled={readOnly || stage.type !== "CUSTOM"} onChange={(e) => updateStage(stage.stageId, { customLabel: e.target.value })} />
                <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" value={stage.submittedAt ?? ""} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { submittedAt: e.target.value || null })} />
                <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" value={stage.resultAt ?? ""} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { resultAt: e.target.value || null })} />
                <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" value={stage.result} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { result: e.target.value as StageResult })}>
                  {RESULT_OPTIONS.map((result) => <option key={result} value={result}>{result}</option>)}
                </select>
                <input className="md:col-span-3 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" placeholder="Notes" value={stage.notes} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { notes: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        {!readOnly ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">Add Custom Stage</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white" value={newCustomLabel} onChange={(e) => setNewCustomLabel(e.target.value)} placeholder="Label" />
              <button
                className="rounded-full border border-cyan-300/50 px-3 py-1 text-xs text-cyan-300"
                onClick={() => {
                  if (!newCustomLabel.trim()) return;
                  const stage: Stage = { stageId: crypto.randomUUID(), type: "CUSTOM", customLabel: newCustomLabel.trim(), submittedAt: null, resultAt: null, result: "PENDING", notes: "" };
                  setDraft((prev) => (prev ? { ...prev, stages: [...prev.stages, stage] } : prev));
                  setNewCustomLabel("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(pendingRemoveStageId)}
        title="Remove Stage"
        description="Remove this stage from the application?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setPendingRemoveStageId(null)}
        onConfirm={() => {
          if (!pendingRemoveStageId) return;
          removeStage(pendingRemoveStageId);
          setPendingRemoveStageId(null);
        }}
      />
    </>
  );
}
