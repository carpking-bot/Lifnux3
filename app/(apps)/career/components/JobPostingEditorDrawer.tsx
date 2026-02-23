import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { DateInput } from "./DateInput";
import { JOB_POSTING_CONTRACT_TYPES } from "../types";
import type { Industry, JobPosting } from "../types";

type Props = {
  open: boolean;
  posting: JobPosting;
  isEditing: boolean;
  initialMode: "view" | "edit" | "create";
  industries: Industry[];
  onClose: () => void;
  onSave: (next: JobPosting) => void;
  onApply: (posting: JobPosting) => void;
  onDelete: (postingId: string) => string | null;
  onManageIndustries: () => void;
};

type LongFieldKey = "departmentInfo" | "responsibilities" | "requirements" | "neededSkills" | "preferred" | "memo" | "comment";
type EditorMode = "view" | "edit" | "create";

function toLocalDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function normalizeDraft(posting: JobPosting): JobPosting {
  return {
    ...posting,
    companyName: posting.companyName ?? "",
    postingTitle: posting.postingTitle ?? "",
    role: posting.role ?? "",
    contractType: posting.contractType ?? "정규직",
    industryId: posting.industryId ?? null,
    departmentInfo: posting.departmentInfo ?? "",
    responsibilities: posting.responsibilities ?? "",
    requirements: posting.requirements ?? "",
    neededSkills: posting.neededSkills ?? "",
    preferred: posting.preferred ?? "",
    memo: posting.memo ?? "",
    comment: posting.comment ?? "",
    deadline: posting.deadline ?? null,
    importance: Math.min(10, Math.max(1, Math.round(posting.importance ?? 6))),
    isFavorite: Boolean(posting.isFavorite),
    link: posting.link ?? null
  };
}

function AutoSizeTextarea({
  label,
  value,
  onChange,
  minHeight = 180,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.max(minHeight, ref.current.scrollHeight)}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
      {label}
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-white"
        style={{ minHeight }}
      />
    </label>
  );
}

function ReadonlyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-[var(--ink-1)]">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white">{value.trim() ? value : "-"}</div>
    </div>
  );
}

export function JobPostingEditorDrawer({
  open,
  posting,
  isEditing,
  initialMode,
  industries,
  onClose,
  onSave,
  onApply,
  onDelete,
  onManageIndustries
}: Props) {
  const [draft, setDraft] = useState<JobPosting>(normalizeDraft(posting));
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [mode, setMode] = useState<EditorMode>("create");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeDraft(posting);
    setDraft(normalized);
    setInitialSnapshot(JSON.stringify(normalized));
    setMode(initialMode);
    setValidationError(null);
    setShowLeaveConfirm(false);
    setShowDeleteConfirm(false);
  }, [open, posting, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, draft, initialSnapshot]);

  const dirty = useMemo(() => (mode === "edit" || mode === "create") && JSON.stringify(draft) !== initialSnapshot, [draft, initialSnapshot, mode]);

  const requestClose = () => {
    if (dirty) {
      setShowLeaveConfirm(true);
      return;
    }
    onClose();
  };

  const patchDraft = (patch: Partial<JobPosting>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (validationError) setValidationError(null);
  };

  const patchLongText = (key: LongFieldKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const submit = () => {
    if (!draft.companyName.trim() || !draft.postingTitle.trim() || !draft.role.trim()) {
      setValidationError("회사명, 공고명, 직무는 필수입니다.");
      return;
    }
    onSave({
      ...draft,
      companyName: draft.companyName.trim(),
      postingTitle: draft.postingTitle.trim(),
      role: draft.role.trim(),
      link: draft.link?.trim() ? draft.link.trim() : null,
      deadline: draft.deadline || null,
      importance: Math.min(10, Math.max(1, Math.round(draft.importance)))
    });
  };

  const handleDelete = () => {
    const error = onDelete(draft.postingId);
    if (error) {
      setValidationError(error);
      return;
    }
    setShowDeleteConfirm(false);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[1100] bg-black/55 backdrop-blur-sm" onClick={requestClose} />
      <div className="fixed inset-y-0 right-0 z-[1110] w-full lg:w-[70vw]">
        <section className="flex h-full flex-col border-l border-white/10 bg-[#060912]/95 shadow-2xl">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090d17]/95 px-6 py-4 backdrop-blur">
            <div className="grid items-start gap-4 xl:grid-cols-[160px_1fr_auto]">
              <div className="pt-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                {mode === "view" ? "공고 보기" : isEditing ? "공고 수정" : "공고 추가"}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {mode === "view" ? (
                  <>
                    <div className="rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-lg font-semibold text-white">{draft.companyName || "-"}</div>
                    <div className="rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-lg font-semibold text-white">{draft.postingTitle || "-"}</div>
                  </>
                ) : (
                  <>
                    <input
                      value={draft.companyName}
                      onChange={(event) => patchDraft({ companyName: event.target.value })}
                      placeholder="회사명"
                      className="rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-lg font-semibold text-white"
                    />
                    <input
                      value={draft.postingTitle}
                      onChange={(event) => patchDraft({ postingTitle: event.target.value })}
                      placeholder="공고명"
                      className="rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-lg font-semibold text-white"
                    />
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {draft.link ? (
                  <a
                    href={draft.link}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-cyan-300/60 px-3 py-1.5 text-xs text-cyan-200"
                  >
                    링크 열기
                  </a>
                ) : null}
                {isEditing ? (
                  <button
                    className="rounded-full border border-emerald-300/60 px-3 py-1.5 text-xs text-emerald-200"
                    onClick={() => onApply(draft)}
                  >
                    지원
                  </button>
                ) : null}
                {isEditing && mode === "view" ? (
                  <button className="rounded-full border border-cyan-300/60 px-3 py-1.5 text-xs text-cyan-200" onClick={() => setMode("edit")}>
                    수정
                  </button>
                ) : null}
                {isEditing ? (
                  <button
                    className="rounded-full border border-rose-400/50 px-3 py-1.5 text-xs text-rose-300"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    삭제
                  </button>
                ) : null}
                <button className="rounded-full border border-white/20 px-3 py-1.5 text-xs" onClick={requestClose}>
                  취소
                </button>
                {mode !== "view" ? (
                  <button className="rounded-full bg-cyan-300/90 px-3 py-1.5 text-xs text-black" onClick={submit}>
                    저장
                  </button>
                ) : null}
              </div>
            </div>
            {validationError ? <div className="mt-3 text-xs text-rose-300">{validationError}</div> : null}
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {mode === "view" ? (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-4">
                  <ReadonlyBlock label="부서 정보" value={draft.departmentInfo} />
                  <ReadonlyBlock label="주요 업무" value={draft.responsibilities} />
                  <ReadonlyBlock label="자격요건" value={draft.requirements} />
                  <ReadonlyBlock label="필요 역량" value={draft.neededSkills} />
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  <ReadonlyBlock label="우대사항" value={draft.preferred} />
                  <ReadonlyBlock label="메모" value={draft.memo} />
                  <ReadonlyBlock label="코멘트" value={draft.comment} />
                </div>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  산업 카테고리
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <select
                      className="lifnux-select rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                      value={draft.industryId ?? ""}
                      onChange={(event) => patchDraft({ industryId: event.target.value || null })}
                    >
                      <option value="">미분류</option>
                      {industries.map((industry) => (
                        <option key={industry.industryId} value={industry.industryId}>
                          {industry.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-xl border border-white/20 px-3 py-2 text-xs text-[var(--ink-1)]"
                      onClick={onManageIndustries}
                    >
                      관리
                    </button>
                  </div>
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  직무
                  <input
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={draft.role}
                    onChange={(event) => patchDraft({ role: event.target.value })}
                    placeholder="직무"
                  />
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  고용형태
                  <select
                    className="lifnux-select mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    value={draft.contractType}
                    onChange={(event) => patchDraft({ contractType: event.target.value as JobPosting["contractType"] })}
                  >
                    {JOB_POSTING_CONTRACT_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  중요도
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={draft.importance}
                      onChange={(event) => patchDraft({ importance: Number(event.target.value) })}
                      className="w-full"
                    />
                    <div className="mt-2 text-sm font-semibold text-cyan-200">{draft.importance}</div>
                  </div>
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  마감일
                  <DateInput
                    className="mt-2 w-full"
                    inputClassName="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-base text-white text-center tabular-nums"
                    value={draft.deadline ?? ""}
                    onChange={(value) => patchDraft({ deadline: value || null })}
                  />
                </label>

                <label className="block text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                  링크
                  <input
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    placeholder="https://..."
                    value={draft.link ?? ""}
                    onChange={(event) => patchDraft({ link: event.target.value || null })}
                  />
                </label>

                {isEditing ? (
                  <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-[11px] text-[var(--ink-1)]">
                    <div>생성일: {toLocalDate(draft.createdAt)}</div>
                    <div className="mt-1">수정일: {toLocalDate(draft.updatedAt)}</div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-5 rounded-2xl border border-white/10 bg-black/25 p-4">
                <AutoSizeTextarea
                  label="부서 정보"
                  value={draft.departmentInfo}
                  onChange={(value) => patchLongText("departmentInfo", value)}
                  placeholder="부서/팀 정보"
                />
                <AutoSizeTextarea
                  label="주요 업무"
                  value={draft.responsibilities}
                  onChange={(value) => patchLongText("responsibilities", value)}
                  placeholder="담당 업무"
                />
                <AutoSizeTextarea
                  label="자격요건"
                  value={draft.requirements}
                  onChange={(value) => patchLongText("requirements", value)}
                  placeholder="필수 자격요건"
                />
                <AutoSizeTextarea
                  label="필요 역량"
                  value={draft.neededSkills}
                  onChange={(value) => patchLongText("neededSkills", value)}
                  placeholder="필요 역량"
                />
                <AutoSizeTextarea
                  label="우대사항"
                  value={draft.preferred}
                  onChange={(value) => patchLongText("preferred", value)}
                  placeholder="우대 조건"
                />
                <AutoSizeTextarea
                  label="메모"
                  value={draft.memo}
                  onChange={(value) => patchLongText("memo", value)}
                  placeholder="내부 메모"
                />
                <AutoSizeTextarea
                  label="코멘트"
                  value={draft.comment}
                  onChange={(value) => patchLongText("comment", value)}
                  placeholder="추가 코멘트"
                />
              </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        open={showLeaveConfirm}
        title="변경사항 폐기"
        description="저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫을까요?"
        confirmLabel="닫기"
        cancelLabel="계속 편집"
        variant="danger"
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={() => {
          setShowLeaveConfirm(false);
          onClose();
        }}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="공고 삭제"
        description="이 공고를 삭제할까요?"
        detail="지원 내역과 연결된 공고는 삭제할 수 없습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}






