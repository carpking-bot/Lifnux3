import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../(shared)/components/Modal";
import type { ContractType, Employment, EmploymentChange } from "../types";

type Props = {
  open: boolean;
  employments: Employment[];
  changes: EmploymentChange[];
  onClose: () => void;
  onSave: (nextEmployments: Employment[], nextChanges: EmploymentChange[]) => void;
};

const CONTRACT_TYPES: ContractType[] = ["Full-time", "Contract", "Intern", "Other"];

function makeEmploymentDraft(): Employment {
  return {
    employmentId: crypto.randomUUID(),
    companyName: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    contractType: "Full-time",
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

export function CareerEditorModal({ open, employments, changes, onClose, onSave }: Props) {
  const [draftEmployments, setDraftEmployments] = useState<Employment[]>([]);
  const [draftChanges, setDraftChanges] = useState<EmploymentChange[]>([]);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState<string | null>(null);
  const [employmentForm, setEmploymentForm] = useState<Employment>(makeEmploymentDraft());
  const [changeForm, setChangeForm] = useState<EmploymentChange | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftEmployments(employments);
    setDraftChanges(changes);
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
    if (!employmentForm.companyName.trim()) return;
    const next = draftEmployments.some((item) => item.employmentId === employmentForm.employmentId)
      ? draftEmployments.map((item) => (item.employmentId === employmentForm.employmentId ? employmentForm : item))
      : [employmentForm, ...draftEmployments];
    setDraftEmployments(next);
    setSelectedEmploymentId(employmentForm.employmentId);
    setChangeForm(makeChangeDraft(employmentForm.employmentId));
  };

  const deleteEmployment = (employmentId: string) => {
    if (!window.confirm("Delete this employment and all its changes?")) return;
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
    if (!changeForm) return;
    if (!changeForm.department.trim() && !changeForm.title.trim()) return;
    const next = draftChanges.some((item) => item.changeId === changeForm.changeId)
      ? draftChanges.map((item) => (item.changeId === changeForm.changeId ? changeForm : item))
      : [changeForm, ...draftChanges];
    setDraftChanges(next);
    setChangeForm(makeChangeDraft(changeForm.employmentId));
  };

  const editChange = (changeId: string) => {
    const found = draftChanges.find((item) => item.changeId === changeId);
    if (!found) return;
    setChangeForm(found);
  };

  const deleteChange = (changeId: string) => {
    if (!window.confirm("Delete this change?")) return;
    setDraftChanges((prev) => prev.filter((item) => item.changeId !== changeId));
    if (changeForm?.changeId === changeId && selectedEmploymentId) {
      setChangeForm(makeChangeDraft(selectedEmploymentId));
    }
  };

  return (
    <Modal
      open={open}
      title="Edit Career"
      onClose={onClose}
      closeOnBackdrop
      closeOnEsc
      panelClassName="!max-w-[1200px]"
      actions={
        <>
          <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={onClose}>Cancel</button>
          <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={() => onSave(draftEmployments, draftChanges)}>Save</button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">Employments</div>
          <div className="max-h-[260px] space-y-2 overflow-y-auto">
            {draftEmployments.map((emp) => (
              <div key={emp.employmentId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <button className="w-full text-left" onClick={() => selectEmployment(emp.employmentId)}>
                  <div className="text-sm text-white">{emp.companyName || "(No company)"}</div>
                  <div className="text-xs text-[var(--ink-1)]">{emp.startDate} ~ {emp.endDate ?? "Present"}</div>
                </button>
                <div className="mt-2 flex justify-end gap-2">
                  <button className="rounded-full border border-white/20 px-2 py-1 text-[11px]" onClick={() => selectEmployment(emp.employmentId)}>Edit</button>
                  <button className="rounded-full border border-rose-400/50 px-2 py-1 text-[11px] text-rose-300" onClick={() => deleteEmployment(emp.employmentId)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="rounded-full border border-white/20 px-3 py-1 text-xs"
            onClick={() => {
              const fresh = makeEmploymentDraft();
              setEmploymentForm(fresh);
              setSelectedEmploymentId(fresh.employmentId);
              setChangeForm(makeChangeDraft(fresh.employmentId));
            }}
          >
            Add Employment
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">Employment Form</div>
            <div className="grid gap-2 md:grid-cols-2">
              <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Company" value={employmentForm.companyName} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, companyName: e.target.value }))} />
              <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={employmentForm.contractType} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, contractType: e.target.value as ContractType }))}>
                {CONTRACT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={employmentForm.startDate} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, startDate: e.target.value }))} />
              <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={employmentForm.endDate ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, endDate: e.target.value || null }))} />
              <label className="flex items-center gap-2 text-xs text-[var(--ink-1)]">
                <input type="checkbox" checked={employmentForm.isCurrent} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, isCurrent: e.target.checked, endDate: e.target.checked ? null : prev.endDate }))} />
                Is Current
              </label>
              <input type="number" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Remaining PTO" value={employmentForm.remainingPTO ?? ""} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, remainingPTO: e.target.value === "" ? null : Number(e.target.value) }))} disabled={!employmentForm.isCurrent} />
            </div>
            <textarea rows={2} className="mt-2 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Notes" value={employmentForm.notes} onChange={(e) => setEmploymentForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <div className="mt-2 flex justify-end">
              <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={upsertEmployment}>Save Employment</button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-1)]">Employment Changes</div>
            {!selectedEmploymentId ? (
              <div className="text-xs text-[var(--ink-1)]">Select or add employment first.</div>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-3">
                  <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={changeForm?.effectiveDate ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, effectiveDate: e.target.value } : prev))} />
                  <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Department" value={changeForm?.department ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, department: e.target.value } : prev))} />
                  <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Title" value={changeForm?.title ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))} />
                  <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Level" value={changeForm?.level ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, level: e.target.value } : prev))} />
                  <input type="number" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Salary KRW" value={changeForm?.salaryKRW ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, salaryKRW: e.target.value === "" ? null : Number(e.target.value) } : prev))} />
                  <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Memo" value={changeForm?.memo ?? ""} onChange={(e) => setChangeForm((prev) => (prev ? { ...prev, memo: e.target.value } : prev))} />
                </div>
                <div className="mt-2 flex justify-end">
                  <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={upsertChange}>Save Change</button>
                </div>

                <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto">
                  {selectedChanges.map((change) => (
                    <div key={change.changeId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <div className="text-sm text-white">{change.effectiveDate} · {change.department} · {change.title}</div>
                      <div className="text-xs text-[var(--ink-1)]">{change.level} · {typeof change.salaryKRW === "number" ? `${change.salaryKRW.toLocaleString("ko-KR")} KRW` : "-"}</div>
                      <div className="mt-2 flex justify-end gap-2">
                        <button className="rounded-full border border-white/20 px-2 py-1 text-[11px]" onClick={() => editChange(change.changeId)}>Edit</button>
                        <button className="rounded-full border border-rose-400/50 px-2 py-1 text-[11px] text-rose-300" onClick={() => deleteChange(change.changeId)}>Delete</button>
                      </div>
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
