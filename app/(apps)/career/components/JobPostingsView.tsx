import { JOB_POSTING_CONTRACT_TYPES } from "../types";
import type { Industry, JobPosting, JobPostingContractType } from "../types";

type Props = {
  postings: JobPosting[];
  industries: Industry[];
  industryFilter: string;
  contractFilter: JobPostingContractType | "";
  roleFilter: string;
  onChangeIndustryFilter: (value: string) => void;
  onChangeContractFilter: (value: JobPostingContractType | "") => void;
  onChangeRoleFilter: (value: string) => void;
  onCreate: () => void;
  onEdit: (posting: JobPosting) => void;
  onDelete: (posting: JobPosting) => void;
  onToggleFavorite: (posting: JobPosting) => void;
};

function importanceClass(importance: number) {
  if (importance >= 7) return "border-rose-400/50 text-rose-300";
  if (importance >= 4) return "border-amber-300/50 text-amber-300";
  return "border-cyan-300/50 text-cyan-300";
}

function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isDeadlineSoon(deadline: string | null) {
  if (!deadline) return false;
  const now = new Date(`${ymd()}T00:00:00`).getTime();
  const end = new Date(`${deadline}T00:00:00`).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(end)) return false;
  const diffDays = Math.floor((end - now) / 86400000);
  return diffDays >= 0 && diffDays <= 14;
}

export function JobPostingsView({
  postings,
  industries,
  industryFilter,
  contractFilter,
  roleFilter,
  onChangeIndustryFilter,
  onChangeContractFilter,
  onChangeRoleFilter,
  onCreate,
  onEdit,
  onDelete,
  onToggleFavorite
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="lifnux-select rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm"
          value={industryFilter}
          onChange={(e) => onChangeIndustryFilter(e.target.value)}
        >
          <option value="">전체 산업</option>
          {industries.map((industry) => (
            <option key={industry.industryId} value={industry.industryId}>
              {industry.name}
            </option>
          ))}
        </select>
        <select
          className="lifnux-select rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm"
          value={contractFilter}
          onChange={(e) => onChangeContractFilter((e.target.value || "") as JobPostingContractType | "")}
        >
          <option value="">전체 고용형태</option>
          {JOB_POSTING_CONTRACT_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          className="rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm"
          placeholder="직무"
          value={roleFilter}
          onChange={(e) => onChangeRoleFilter(e.target.value)}
        />
        <button className="ml-auto rounded-full border border-cyan-300/50 px-4 py-2 text-sm text-cyan-300" onClick={onCreate}>
          공고 추가
        </button>
      </div>

      <div className="space-y-2">
        {postings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-base text-[var(--ink-1)]">등록된 공고가 없습니다.</div>
        ) : (
          postings.map((posting) => {
            const industryName = industries.find((item) => item.industryId === posting.industryId)?.name ?? "미분류";
            const deadlineSoon = isDeadlineSoon(posting.deadline);
            return (
              <div key={posting.postingId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg border px-3 py-1 text-sm font-semibold ${importanceClass(posting.importance)}`}>{posting.importance}</span>
                      <span className="rounded-lg border border-white/20 px-3 py-1 text-base font-semibold text-white">{posting.companyName}</span>
                      <span className="rounded-lg border border-white/20 px-3 py-1 text-base text-white">{posting.postingTitle}</span>
                    </div>
                    <div className="ml-4 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{industryName}</span>
                      <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{posting.role}</span>
                      <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{posting.contractType}</span>
                    </div>
                    <div className="ml-4 flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg border border-white/20 px-3 py-1 text-sm ${deadlineSoon ? "text-rose-300" : "text-[var(--ink-1)]"}`}>
                        {posting.deadline ? `마감일 ${posting.deadline}` : "마감일 -"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                    <button
                      className={`rounded-full border px-4 py-2 text-sm ${posting.isFavorite ? "border-amber-300/60 text-amber-300" : "border-white/20 text-[var(--ink-1)]"}`}
                      onClick={() => onToggleFavorite(posting)}
                    >
                      {posting.isFavorite ? "★" : "☆"}
                    </button>
                    <button className="rounded-full border border-white/20 px-4 py-2 text-sm" onClick={() => onEdit(posting)}>
                      보기
                    </button>
                    {posting.link ? (
                      <a
                        className="rounded-full border border-cyan-300/50 px-4 py-2 text-sm text-cyan-300"
                        href={posting.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        링크
                      </a>
                    ) : (
                      <button className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--ink-2)]" disabled>
                        링크
                      </button>
                    )}
                    <button className="rounded-full border border-rose-400/50 px-4 py-2 text-sm text-rose-300" onClick={() => onDelete(posting)}>
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

