import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../(shared)/components/Modal";
import { DateInput } from "./DateInput";
import type { ContractType, Employment, EmploymentChange } from "../types";

type Props = {
  open: boolean;
  employments: Employment[];
  changes: EmploymentChange[];
  onClose: () => void;
  onSave: (nextEmployments: Employment[], nextChanges: EmploymentChange[]) => void;
};

const CONTRACT_TYPES: ContractType[] = ["Full-time", "Contract", "Short-term Contract", "Part-time", "Intern", "Other"];
const DARK_SCROLLBAR_CLASS = "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30";

function contractTypeLabel(type: ContractType) {
  if (type === "Full-time") return "정규직";
  if (type === "Contract") return "계약직";
  if (type === "Short-term Contract") return "단기계약직";
  if (type === "Part-time") return "아르바이트";
  if (type === "Intern") return "인턴";
  return "기타";
}

function parseNumericInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function formatNumberWithCommas(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("ko-KR");
}

function makeEmploymentDraft(): Employment {
  return {
    employmentId: crypto.randomUUID(),
    companyName: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    contractType: "Full-time",
    department: "",
    title: "",
    level: "",
    salaryKRW: null,
    isCurrent: true,
    remainingPTO: null,
    notes: ""
  };
}

function makeChangeDraft(employmentId: string): EmploymentChange {
  return {
    changeId: crypto.randomUUID(),
    employmentId,
    effectiveDate: new Date().toISOString().slice(0, 10),
    department: "",
    title: "",
    level: "",
    salaryKRW: null,
    memo: ""
  };
}

function SalaryInput({
  value,
  onChange,
  disabled,
  placeholder
}: {
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center rounded-lg border border-white/15 bg-black/25 px-3 py-2">
      <span className="mr-2 text-sm text-[var(--ink-1)]">원</span>
      <input
        className="w-full bg-transparent text-sm text-white tabular-nums outline-none disabled:text-[var(--ink-1)]"
        inputMode="numeric"
        placeholder={placeholder}
        value={formatNumberWithCommas(value)}
        disabled={disabled}
        onChange={(event) => onChange(parseNumericInput(event.target.value))}
      />
    </div>
  );
}

export function CareerEditorModal({ open, employments, changes, onClose, onSave }: Props) {
  const [draftEmployments, setDraftEmployments] = useState<Employment[]>([]);
  const [draftChanges, setDraftChanges] = useState<EmploymentChange[]>([]);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState<string | null>(null);
  const [employmentForm, setEmploymentForm] = useState<Employment>(makeEmploymentDraft());
  const [changeForm, setChangeForm] = useState<EmploymentChange | null>(null);
  const [editingEnabled, setEditingEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftEmployments(employments);
    setDraftChanges(changes);
    setEditingEnabled(false);
    const first = employments[0]?.employmentId ?? null;
    setSelectedEmploymentId(first);
    setEmploymentForm(first ? (employments.find((item) => item.employmentId === first) ?? makeEmploymentDraft()) : makeEmploymentDraft());
    setChangeForm(first ? makeChangeDraft(first) : null);
  }, [open, employments, changes]);

  const selectedChanges = useMemo(() => {
    if (!selectedEmploymentId) return [];
    return draftChanges
      .filter((item) => item.employmentId === selectedEmploymentId)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  }, [draftChanges, selectedEmploymentId]);

  const selectEmployment = (employmentId: string) => {
    const found = draftEmployments.find((item) => item.employmentId === employmentId);
    if (!found) return;
    setSelectedEmploymentId(employmentId);
    setEmploymentForm(found);
    setChangeForm(makeChangeDraft(employmentId));
  };

  const upsertEmployment = () => {
    if (!editingEnabled) return;
    if (!employmentForm.companyName.trim()) return;
    const next = draftEmployments.some((item) => item.employmentId === employmentForm.employmentId)
      ? draftEmployments.map((item) => (item.employmentId === employmentForm.employmentId ? employmentForm : item))
      : [employmentForm, ...draftEmployments];
    setDraftEmployments(next);
    setSelectedEmploymentId(employmentForm.employmentId);
    setChangeForm(makeChangeDraft(employmentForm.employmentId));
  };

  const deleteEmployment = (employmentId: string) => {
    if (!editingEnabled) return;
    if (!window.confirm("이 경력과 연결된 변경 이력을 모두 삭제할까요?")) return;
    const nextEmployments = draftEmployments.filter((item) => item.employmentId !== employmentId);
    const nextChanges = draftChanges.filter((item) => item.employmentId !== employmentId);
    setDraftEmployments(nextEmployments);
    setDraftChanges(nextChanges);
    const nextSelected = nextEmployments[0]?.employmentId ?? null;
    setSelectedEmploymentId(nextSelected);
    if (nextSelected) {
      const nextEmployment = nextEmployments.find((item) => item.employmentId === nextSelected);
      if (nextEmployment) setEmploymentForm(nextEmployment);
      setChangeForm(makeChangeDraft(nextSelected));
    } else {
      setEmploymentForm(makeEmploymentDraft());
      setChangeForm(null);
    }
  };

  const upsertChange = () => {
    if (!editingEnabled || !changeForm) return;
    if (!changeForm.department.trim() && !changeForm.title.trim()) return;
    const next = draftChanges.some((item) => item.changeId === changeForm.changeId)
      ? draftChanges.map((item) => (item.changeId === changeForm.changeId ? changeForm : item))
      : [changeForm, ...draftChanges];
    setDraftChanges(next);
    setChangeForm(makeChangeDraft(changeForm.employmentId));
  };

  const editChange = (changeId: string) => {
    if (!editingEnabled) return;
    const found = draftChanges.find((item) => item.changeId === changeId);
    if (!found) return;
    setChangeForm(found);
  };

  const deleteChange = (changeId: string) => {
    if (!editingEnabled) return;
    if (!window.confirm("이 변경 이력을 삭제할까요?")) return;
    setDraftChanges((prev) => prev.filter((item) => item.changeId !== changeId));
    if (changeForm?.changeId === changeId && selectedEmploymentId) {
      setChangeForm(makeChangeDraft(selectedEmploymentId));
    }
  };

  const resetToOriginal = () => {
    setDraftEmployments(employments);
    setDraftChanges(changes);
    const first = employments[0]?.employmentId ?? null;
    setSelectedEmploymentId(first);
    setEmploymentForm(first ? (employments.find((item) => item.employmentId === first) ?? makeEmploymentDraft()) : makeEmploymentDraft());
    setChangeForm(first ? makeChangeDraft(first) : null);
    setEditingEnabled(false);
  };

  return (
    <Modal
      open={open}
      title="커리어 편집"
      onClose={onClose}
      closeOnBackdrop
      closeOnEsc
      panelClassName={`!max-w-[1200px] ${DARK_SCROLLBAR_CLASS}`}
      actions={
        <>
          <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={onClose}>닫기</button>
          {editingEnabled ? (
            <>
              <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={resetToOriginal}>수정 취소</button>
              <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={() => onSave(draftEmployments, draftChanges)}>저장</button>
            </>
          ) : (
            <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={() => setEditingEnabled(true)}>수정</button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">경력 목록</div>
          <div className={`max-h-[260px] space-y-2 overflow-y-auto ${DARK_SCROLLBAR_CLASS}`}>
            {draftEmployments.map((emp) => (
              <div key={emp.employmentId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <button className="w-full text-left" onClick={() => selectEmployment(emp.employmentId)}>
                  <div className="text-sm text-white">{emp.companyName || "(회사명 없음)"}</div>
                  <div className="text-xs text-[var(--ink-1)]">{emp.startDate} ~ {emp.endDate ?? "재직중"}</div>
                </button>
                {editingEnabled ? (
                  <div className="mt-2 flex justify-end gap-2">
                    <button className="rounded-full border border-white/20 px-2 py-1 text-[11px]" onClick={() => selectEmployment(emp.employmentId)}>수정</button>
                    <button className="rounded-full border border-rose-400/50 px-2 py-1 text-[11px] text-rose-300" onClick={() => deleteEmployment(emp.employmentId)}>삭제</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {editingEnabled ? (
            <button
              className="rounded-full border border-white/20 px-3 py-1 text-xs"
              onClick={() => {
                const fresh = makeEmploymentDraft();
                setEmploymentForm(fresh);
                setSelectedEmploymentId(fresh.employmentId);
                setChangeForm(makeChangeDraft(fresh.employmentId));
              }}
            >
              경력 추가
            </button>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">경력 입력</div>
            <div className="grid gap-2 md:grid-cols-2">
              <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="회사명" value={employmentForm.companyName} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, companyName: e.target.value }))} />
              <select disabled={!editingEnabled} className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" value={employmentForm.contractType} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, contractType: e.target.value as ContractType }))}>
                {CONTRACT_TYPES.map((type) => <option key={type} value={type}>{contractTypeLabel(type)}</option>)}
              </select>
              <DateInput
                className="w-full"
                inputClassName="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-base text-white text-center tabular-nums"
                value={employmentForm.startDate}
                disabled={!editingEnabled}
                onChange={(value) => setEmploymentForm((prev) => ({ ...prev, startDate: value }))}
              />
              <DateInput
                className="w-full"
                inputClassName="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-base text-white text-center tabular-nums"
                value={employmentForm.endDate ?? ""}
                disabled={!editingEnabled}
                onChange={(value) => setEmploymentForm((prev) => ({ ...prev, endDate: value || null }))}
              />
              <label className="flex items-center gap-2 text-xs text-[var(--ink-1)]">
                <input disabled={!editingEnabled} type="checkbox" checked={employmentForm.isCurrent} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, isCurrent: e.target.checked, endDate: e.target.checked ? null : prev.endDate }))} />
                현재 재직중
              </label>
              <input disabled={!editingEnabled || !employmentForm.isCurrent} type="number" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="잔여 연차" value={employmentForm.remainingPTO ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, remainingPTO: e.target.value === "" ? null : Number(e.target.value) }))} />
              <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="부서" value={employmentForm.department ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, department: e.target.value }))} />
              <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="직책" value={employmentForm.title ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, title: e.target.value }))} />
              <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="직급" value={employmentForm.level ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, level: e.target.value }))} />
              <SalaryInput value={employmentForm.salaryKRW} disabled={!editingEnabled} placeholder="연봉" onChange={(next) => setEmploymentForm((prev) => ({ ...prev, salaryKRW: next }))} />
            </div>
            <textarea disabled={!editingEnabled} rows={2} className="mt-2 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="메모" value={employmentForm.notes} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, notes: e.target.value }))} />
            {editingEnabled ? (
              <div className="mt-2 flex justify-end">
                <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={upsertEmployment}>경력 저장</button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">경력 변경 이력</div>
            {!selectedEmploymentId ? (
              <div className="text-xs text-[var(--ink-1)]">먼저 경력을 선택하거나 추가하세요.</div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  <DateInput
                    className="w-full"
                    inputClassName="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-base text-white text-center tabular-nums"
                    value={changeForm?.effectiveDate ?? ""}
                    disabled={!editingEnabled}
                    onChange={(value) => setChangeForm((prev) => (prev ? { ...prev, effectiveDate: value } : prev))}
                  />
                  <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="부서" value={changeForm?.department ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, department: e.target.value } : prev))} />
                  <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="직책" value={changeForm?.title ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))} />
                  <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="직급" value={changeForm?.level ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, level: e.target.value } : prev))} />
                  <SalaryInput value={changeForm?.salaryKRW ?? null} disabled={!editingEnabled} placeholder="연봉" onChange={(next) => setChangeForm((prev) => (prev ? { ...prev, salaryKRW: next } : prev))} />
                  <input disabled={!editingEnabled} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white disabled:text-[var(--ink-1)]" placeholder="메모" value={changeForm?.memo ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, memo: e.target.value } : prev))} />
                </div>
                {editingEnabled ? (
                  <div className="mt-2 flex justify-end">
                    <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={upsertChange}>변경 이력 저장</button>
                  </div>
                ) : null}

                <div className={`mt-3 max-h-[220px] space-y-2 overflow-y-auto ${DARK_SCROLLBAR_CLASS}`}>
                  {selectedChanges.map((change) => (
                    <div key={change.changeId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-sm text-white">{change.effectiveDate} · {change.department} · {change.title}</div>
                      <div className="text-xs text-[var(--ink-1)]">{change.level} · {typeof change.salaryKRW === "number" ? `${change.salaryKRW.toLocaleString("ko-KR")}원` : "-"}</div>
                      {editingEnabled ? (
                        <div className="mt-2 flex justify-end gap-2">
                          <button className="rounded-full border border-white/20 px-2 py-1 text-[11px]" onClick={() => editChange(change.changeId)}>수정</button>
                          <button className="rounded-full border border-rose-400/50 px-2 py-1 text-[11px] text-rose-300" onClick={() => deleteChange(change.changeId)}>삭제</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
