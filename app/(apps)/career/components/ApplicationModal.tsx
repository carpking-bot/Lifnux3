import { useEffect, useState } from "react";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Modal } from "../../../(shared)/components/Modal";
import { autoDoneOnFinal, stageLabel } from "../lib/stageHelpers";
import { DateInput } from "./DateInput";
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

function typeLabel(type: StageType) {
  if (type === "DOCUMENT") return "서류";
  if (type === "INTERVIEW_1") return "1차 면접";
  if (type === "INTERVIEW_2") return "2차 면접";
  if (type === "FINAL") return "최종";
  return "커스텀";
}

function resultLabel(result: StageResult) {
  if (result === "PENDING") return "대기";
  if (result === "PASS") return "합격";
  return "불합격";
}

function statusLabel(status: Application["status"]) {
  return status === "IN_PROGRESS" ? "진행 중" : "완료";
}

function finalResultLabel(result: Application["finalResult"]) {
  if (result === "PASS") return "합격";
  if (result === "FAIL") return "불합격";
  return "-";
}

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
        title={`지원 내역 · ${posting?.companyName ?? "알 수 없음"}`}
        onClose={onClose}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[960px]"
        actions={
          <>
            <button className="rounded-full border border-white/20 px-5 py-2.5 text-sm" onClick={onClose}>닫기</button>
            {readOnly ? (
              <>
                <button className="rounded-full border border-cyan-300/50 px-5 py-2.5 text-sm text-cyan-300" onClick={() => onSave(draft)}>메모 저장</button>
                <button className="rounded-full border border-cyan-300/50 px-5 py-2.5 text-sm text-cyan-300" onClick={() => onReopen(draft.applicationId)}>다시 진행</button>
              </>
            ) : (
              <button className="rounded-full border border-cyan-300/50 px-5 py-2.5 text-sm text-cyan-300" onClick={() => onSave(draft)}>저장</button>
            )}
          </>
        }
      >
        <div className="text-sm text-[var(--ink-1)]">{posting?.postingTitle ?? "공고 없음"}</div>
        <div className="grid gap-2 md:grid-cols-[1fr_300px] md:items-center">
          <div className="text-sm text-[var(--ink-1)]">상태: {statusLabel(draft.status)} / 최종: {finalResultLabel(draft.finalResult)}</div>
          <label className="text-sm text-[var(--ink-1)]">
            지원일
            <DateInput
              className="mt-1 w-full"
              inputClassName="w-full min-w-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-lg font-medium text-white text-center tabular-nums"
              value={draft.appliedAt}
              disabled={readOnly}
              onChange={(value) => setDraft((prev) => (prev ? { ...prev, appliedAt: value } : prev))}
            />
          </label>
        </div>

        <div className="space-y-2">
          {draft.stages.map((stage, idx) => (
            <div key={stage.stageId} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="text-base text-white">{idx + 1}. {stageLabel(stage)}</div>
                {!readOnly ? (
                  <>
                    <button className="rounded-full border border-white/20 px-2.5 py-1 text-xs" onClick={() => moveStage(stage.stageId, "up")}>위</button>
                    <button className="rounded-full border border-white/20 px-2.5 py-1 text-xs" onClick={() => moveStage(stage.stageId, "down")}>아래</button>
                    <button className="rounded-full border border-rose-400/50 px-2.5 py-1 text-xs text-rose-300" onClick={() => setPendingRemoveStageId(stage.stageId)}>삭제</button>
                  </>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-12">
                <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white md:col-span-2" value={stage.type} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { type: e.target.value as StageType })}>
                  {TYPE_OPTIONS.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                </select>
                <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white md:col-span-2" placeholder="커스텀 라벨" value={stage.customLabel ?? ""} disabled={readOnly || stage.type !== "CUSTOM"} onChange={(e) => updateStage(stage.stageId, { customLabel: e.target.value })} />
                <div className="w-full md:col-span-3">
                  <div className="mb-1 text-[11px] text-[var(--ink-1)]">진행일(지원/면접)</div>
                  <DateInput
                    className="w-full"
                    inputClassName="w-full min-w-0 rounded-lg border border-cyan-300/20 bg-black/25 px-3 py-2.5 text-lg font-medium text-white text-center tabular-nums"
                    value={stage.submittedAt ?? ""}
                    disabled={readOnly}
                    onChange={(value) => updateStage(stage.stageId, { submittedAt: value || null })}
                  />
                </div>
                <div className="w-full md:col-span-3">
                  <div className="mb-1 text-[11px] text-[var(--ink-1)]">결과발표일</div>
                  <DateInput
                    className="w-full"
                    inputClassName="w-full min-w-0 rounded-lg border border-amber-300/20 bg-black/25 px-3 py-2.5 text-lg font-medium text-white text-center tabular-nums"
                    value={stage.resultAt ?? ""}
                    disabled={readOnly}
                    onChange={(value) => updateStage(stage.stageId, { resultAt: value || null })}
                  />
                </div>
                <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white md:col-span-2" value={stage.result} disabled={readOnly} onChange={(e) => updateStage(stage.stageId, { result: e.target.value as StageResult })}>
                  {RESULT_OPTIONS.map((result) => <option key={result} value={result}>{resultLabel(result)}</option>)}
                </select>
                <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white md:col-span-12" placeholder="메모" value={stage.notes} onChange={(e) => updateStage(stage.stageId, { notes: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        {!readOnly ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-sm uppercase tracking-[0.12em] text-[var(--ink-1)]">커스텀 단계 추가</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={newCustomLabel} onChange={(e) => setNewCustomLabel(e.target.value)} placeholder="단계명" />
              <button
                className="rounded-full border border-cyan-300/50 px-3 py-2 text-sm text-cyan-300"
                onClick={() => {
                  if (!newCustomLabel.trim()) return;
                  const stage: Stage = { stageId: crypto.randomUUID(), type: "CUSTOM", customLabel: newCustomLabel.trim(), submittedAt: null, resultAt: null, result: "PENDING", notes: "" };
                  setDraft((prev) => (prev ? { ...prev, stages: [...prev.stages, stage] } : prev));
                  setNewCustomLabel("");
                }}
              >
                추가
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(pendingRemoveStageId)}
        title="단계 삭제"
        description="이 단계를 지원 내역에서 삭제할까요?"
        confirmLabel="삭제"
        cancelLabel="취소"
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





