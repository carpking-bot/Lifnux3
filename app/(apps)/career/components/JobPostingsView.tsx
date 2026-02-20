import type { Industry, JobPosting } from "../types";

type Props = {
  postings: JobPosting[];
  industries: Industry[];
  industryFilter: string;
  contractFilter: string;
  roleFilter: string;
  onChangeIndustryFilter: (value: string) => void;
  onChangeContractFilter: (value: string) => void;
  onChangeRoleFilter: (value: string) => void;
  onCreate: () => void;
  onEdit: (posting: JobPosting) => void;
  onDelete: (posting: JobPosting) => void;
  onApply: (posting: JobPosting) => void;
};

function importanceClass(importance: JobPosting["importance"]) {
  if (importance === "HIGH") return "border-rose-400/40 text-rose-300";
  if (importance === "MID") return "border-amber-300/40 text-amber-300";
  return "border-cyan-300/40 text-cyan-300";
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
  onApply
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="lifnux-select rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs" value={industryFilter} onChange={(e) => onChangeIndustryFilter(e.target.value)}>
          <option value="">All Industries</option>
          {industries.map((industry) => (
            <option key={industry.industryId} value={industry.industryId}>{industry.name}</option>
          ))}
        </select>
        <input className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs" placeholder="Contract type" value={contractFilter} onChange={(e) => onChangeContractFilter(e.target.value)} />
        <input className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs" placeholder="Role" value={roleFilter} onChange={(e) => onChangeRoleFilter(e.target.value)} />
        <button className="ml-auto rounded-full border border-cyan-300/50 px-3 py-1 text-xs text-cyan-300" onClick={onCreate}>Add Posting</button>
      </div>

      <div className="space-y-2">
        {postings.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">No postings.</div>
        ) : (
          postings.map((posting) => {
            const industryName = industries.find((item) => item.industryId === posting.industryId)?.name ?? "Uncategorized";
            return (
              <div key={posting.postingId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[10px] ${importanceClass(posting.importance)}`}>{posting.importance}</span>
                  <div className="text-sm text-white">{posting.companyName} · {posting.postingTitle}</div>
                  <div className="text-xs text-[var(--ink-1)]">{posting.role} / {posting.contractType}</div>
                  {posting.deadline ? <div className="text-xs text-[var(--ink-1)]">D/L {posting.deadline}</div> : null}
                  <div className="text-xs text-[var(--ink-1)]">{industryName}</div>
                  {posting.link ? <a className="ml-auto text-xs text-cyan-300" href={posting.link} target="_blank" rel="noreferrer">Link</a> : <div className="ml-auto" />}
                </div>
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button className="rounded-full border border-white/20 px-3 py-1 text-xs" onClick={() => onEdit(posting)}>View/Edit</button>
                  <button className="rounded-full border border-rose-400/50 px-3 py-1 text-xs text-rose-300" onClick={() => onDelete(posting)}>Delete</button>
                  <button className="rounded-full border border-emerald-300/50 px-3 py-1 text-xs text-emerald-300" onClick={() => onApply(posting)}>Apply</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
