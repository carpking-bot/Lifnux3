"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import { Modal } from "../../(shared)/components/Modal";
import { ApplicationModal } from "./components/ApplicationModal";
import { CareerEditorModal } from "./components/CareerEditorModal";
import { CareerStatusCard } from "./components/CareerStatusCard";
import { DoneView } from "./components/DoneView";
import { IndustryManagerModal } from "./components/IndustryManagerModal";
import { InProgressView } from "./components/InProgressView";
import { JobPostingsView } from "./components/JobPostingsView";
import { generateCareerSeedData } from "./lib/seed";
import { loadCareerState, saveCareerState } from "./lib/storage";
import { autoDoneOnFinal, createDefaultStageTemplate, deriveCurrentStage, latestStageResultDate, updatedAtForApplication } from "./lib/stageHelpers";
import type { Application, CareerState, Employment, EmploymentChange, Industry, Importance, JobPosting } from "./types";

type ViewMode = "JOB_POSTINGS" | "IN_PROGRESS" | "DONE";
type SortMode = "importance" | "deadline" | "updatedAt" | "appliedAt" | "nextPendingStage" | "resultAt";

function toYmd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function tenureDays(startDate: string, endDate: string | null) {
  const s = new Date(`${startDate}T00:00:00`).getTime();
  const e = new Date(`${(endDate ?? toYmd())}T00:00:00`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, Math.floor((e - s) / 86400000) + 1);
}

function latestChangeForEmployment(changes: EmploymentChange[], employmentId: string): EmploymentChange | null {
  const target = changes.filter((item) => item.employmentId === employmentId).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return target[0] ?? null;
}

function emptyPosting(): JobPosting {
  const now = new Date().toISOString();
  return {
    postingId: crypto.randomUUID(),
    industryId: null,
    companyName: "",
    postingTitle: "",
    role: "",
    contractType: "",
    departmentInfo: "",
    responsibilities: "",
    requirements: "",
    preferred: "",
    memo: "",
    comment: "",
    deadline: null,
    importance: "MID",
    link: null,
    createdAt: now,
    updatedAt: now
  };
}

function importanceRank(v: Importance) {
  if (v === "HIGH") return 0;
  if (v === "MID") return 1;
  return 2;
}

export default function CareerPage() {
  const [state, setState] = useState<CareerState>({ employments: [], employmentChanges: [], industries: [], jobPostings: [], applications: [] });
  const [loaded, setLoaded] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("JOB_POSTINGS");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updatedAt");

  const [industryFilter, setIndustryFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [careerEditorOpen, setCareerEditorOpen] = useState(false);
  const [industryManagerOpen, setIndustryManagerOpen] = useState(false);

  const [postingModalOpen, setPostingModalOpen] = useState(false);
  const [postingDraft, setPostingDraft] = useState<JobPosting>(emptyPosting());
  const [editingPostingId, setEditingPostingId] = useState<string | null>(null);
  const [pendingDeletePostingId, setPendingDeletePostingId] = useState<string | null>(null);

  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [applicationReadOnly, setApplicationReadOnly] = useState(false);

  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);

  useEffect(() => {
    setState(loadCareerState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveCareerState(state);
  }, [loaded, state]);

  const postingMap = useMemo(() => new Map(state.jobPostings.map((item) => [item.postingId, item])), [state.jobPostings]);

  const currentEmployment = useMemo(() => {
    const current = state.employments.find((item) => item.isCurrent);
    if (current) return current;
    return [...state.employments].sort((a, b) => (b.endDate ?? "9999-12-31").localeCompare(a.endDate ?? "9999-12-31"))[0] ?? null;
  }, [state.employments]);

  const latestChange = useMemo(() => {
    if (!currentEmployment) return null;
    return latestChangeForEmployment(state.employmentChanges, currentEmployment.employmentId);
  }, [currentEmployment, state.employmentChanges]);

  const currentTenureDays = useMemo(() => {
    if (!currentEmployment) return 0;
    return tenureDays(currentEmployment.startDate, currentEmployment.endDate);
  }, [currentEmployment]);

  const searchedPostings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.jobPostings.filter((posting) => {
      if (industryFilter && posting.industryId !== industryFilter) return false;
      if (contractFilter.trim() && !posting.contractType.toLowerCase().includes(contractFilter.trim().toLowerCase())) return false;
      if (roleFilter.trim() && !posting.role.toLowerCase().includes(roleFilter.trim().toLowerCase())) return false;
      if (!keyword) return true;
      return (
        posting.companyName.toLowerCase().includes(keyword) ||
        posting.postingTitle.toLowerCase().includes(keyword) ||
        posting.role.toLowerCase().includes(keyword)
      );
    });
  }, [state.jobPostings, search, industryFilter, contractFilter, roleFilter]);

  const inProgressApps = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.applications.filter((app) => {
      if (app.status !== "IN_PROGRESS") return false;
      if (!keyword) return true;
      const posting = postingMap.get(app.postingId);
      return (
        (posting?.companyName ?? "").toLowerCase().includes(keyword) ||
        (posting?.postingTitle ?? "").toLowerCase().includes(keyword) ||
        (posting?.role ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [state.applications, search, postingMap]);

  const doneApps = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.applications.filter((app) => {
      if (app.status !== "DONE") return false;
      if (!keyword) return true;
      const posting = postingMap.get(app.postingId);
      return (
        (posting?.companyName ?? "").toLowerCase().includes(keyword) ||
        (posting?.postingTitle ?? "").toLowerCase().includes(keyword) ||
        (posting?.role ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [state.applications, search, postingMap]);

  const sortedPostings = useMemo(() => {
    const next = [...searchedPostings];
    if (sortMode === "importance") {
      next.sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance));
      return next;
    }
    if (sortMode === "deadline") {
      next.sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));
      return next;
    }
    next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return next;
  }, [searchedPostings, sortMode]);

  const sortedInProgress = useMemo(() => {
    const next = [...inProgressApps];
    if (sortMode === "appliedAt") {
      next.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      return next;
    }
    if (sortMode === "nextPendingStage") {
      next.sort((a, b) => {
        const ai = a.stages.findIndex((s) => s.result === "PENDING");
        const bi = b.stages.findIndex((s) => s.result === "PENDING");
        const av = ai < 0 ? 999 : ai;
        const bv = bi < 0 ? 999 : bi;
        return av - bv;
      });
      return next;
    }
    next.sort((a, b) => updatedAtForApplication(b).localeCompare(updatedAtForApplication(a)));
    return next;
  }, [inProgressApps, sortMode]);

  const sortedDone = useMemo(() => {
    const next = [...doneApps];
    if (sortMode === "appliedAt") {
      next.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      return next;
    }
    next.sort((a, b) => {
      const ar = latestStageResultDate(a) ?? "";
      const br = latestStageResultDate(b) ?? "";
      return br.localeCompare(ar);
    });
    return next;
  }, [doneApps, sortMode]);

  const selectedApplication = useMemo(() => state.applications.find((item) => item.applicationId === selectedApplicationId) ?? null, [state.applications, selectedApplicationId]);
  const selectedApplicationPosting = useMemo(() => (selectedApplication ? postingMap.get(selectedApplication.postingId) ?? null : null), [selectedApplication, postingMap]);

  const resetPostingDraft = () => {
    setEditingPostingId(null);
    setPostingDraft(emptyPosting());
  };

  const savePosting = () => {
    if (!postingDraft.companyName.trim() || !postingDraft.postingTitle.trim()) return;
    const now = new Date().toISOString();
    if (editingPostingId) {
      setState((prev) => ({
        ...prev,
        jobPostings: prev.jobPostings.map((item) => (item.postingId === editingPostingId ? { ...postingDraft, updatedAt: now } : item))
      }));
    } else {
      setState((prev) => ({
        ...prev,
        jobPostings: [{ ...postingDraft, postingId: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...prev.jobPostings]
      }));
    }
    setPostingModalOpen(false);
    resetPostingDraft();
  };

  const applyToPosting = (posting: JobPosting) => {
    const application: Application = {
      applicationId: crypto.randomUUID(),
      postingId: posting.postingId,
      appliedAt: toYmd(),
      status: "IN_PROGRESS",
      finalResult: null,
      stages: createDefaultStageTemplate()
    };
    setState((prev) => ({ ...prev, applications: [application, ...prev.applications] }));
    setViewMode("IN_PROGRESS");
    setSortMode("updatedAt");
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[2200px] pb-20 pt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl">Career</h1>
            <div className="text-sm text-[var(--ink-1)]">MVP local-data career pipeline and timeline manager.</div>
          </div>
          <button className="rounded-full border border-amber-300/50 px-4 py-2 text-xs text-amber-300" onClick={() => setSeedConfirmOpen(true)}>
            Generate Test Data
          </button>
        </div>

        <div className="space-y-4">
          <CareerStatusCard
            currentEmployment={currentEmployment}
            latestChange={latestChange}
            tenureDays={currentTenureDays}
            onOpenEditor={() => setCareerEditorOpen(true)}
          />

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-white/15 bg-black/20 p-1 text-xs">
                <button className={`rounded-full px-3 py-1 ${viewMode === "JOB_POSTINGS" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`} onClick={() => { setViewMode("JOB_POSTINGS"); setSortMode("updatedAt"); }}>Job Postings</button>
                <button className={`rounded-full px-3 py-1 ${viewMode === "IN_PROGRESS" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`} onClick={() => { setViewMode("IN_PROGRESS"); setSortMode("updatedAt"); }}>In Progress</button>
                <button className={`rounded-full px-3 py-1 ${viewMode === "DONE" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`} onClick={() => { setViewMode("DONE"); setSortMode("resultAt"); }}>Done</button>
              </div>

              <input className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs" placeholder="Search company/title/role" value={search} onChange={(e) => setSearch(e.target.value)} />

              <select className="lifnux-select rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                {viewMode === "JOB_POSTINGS" ? (
                  <>
                    <option value="importance">importance</option>
                    <option value="deadline">deadline</option>
                    <option value="updatedAt">updatedAt</option>
                  </>
                ) : null}
                {viewMode === "IN_PROGRESS" ? (
                  <>
                    <option value="appliedAt">appliedAt</option>
                    <option value="nextPendingStage">next pending stage</option>
                    <option value="updatedAt">updatedAt</option>
                  </>
                ) : null}
                {viewMode === "DONE" ? (
                  <>
                    <option value="resultAt">resultAt</option>
                    <option value="appliedAt">appliedAt</option>
                  </>
                ) : null}
              </select>

              <button className="ml-auto rounded-full border border-white/20 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => setIndustryManagerOpen(true)}>
                Manage Categories
              </button>
            </div>

            {viewMode === "JOB_POSTINGS" ? (
              <JobPostingsView
                postings={sortedPostings}
                industries={state.industries}
                industryFilter={industryFilter}
                contractFilter={contractFilter}
                roleFilter={roleFilter}
                onChangeIndustryFilter={setIndustryFilter}
                onChangeContractFilter={setContractFilter}
                onChangeRoleFilter={setRoleFilter}
                onCreate={() => {
                  resetPostingDraft();
                  setPostingModalOpen(true);
                }}
                onEdit={(posting) => {
                  setEditingPostingId(posting.postingId);
                  setPostingDraft(posting);
                  setPostingModalOpen(true);
                }}
                onDelete={(posting) => setPendingDeletePostingId(posting.postingId)}
                onApply={applyToPosting}
              />
            ) : null}

            {viewMode === "IN_PROGRESS" ? (
              <InProgressView
                applications={sortedInProgress}
                postingMap={postingMap}
                onOpen={(app) => {
                  setSelectedApplicationId(app.applicationId);
                  setApplicationReadOnly(false);
                  setApplicationModalOpen(true);
                }}
              />
            ) : null}

            {viewMode === "DONE" ? (
              <DoneView
                applications={sortedDone}
                postingMap={postingMap}
                onOpen={(app) => {
                  setSelectedApplicationId(app.applicationId);
                  setApplicationReadOnly(true);
                  setApplicationModalOpen(true);
                }}
              />
            ) : null}
          </section>
        </div>
      </div>

      <CareerEditorModal
        open={careerEditorOpen}
        employments={state.employments}
        changes={state.employmentChanges}
        onClose={() => setCareerEditorOpen(false)}
        onSave={(nextEmployments, nextChanges) => {
          setState((prev) => ({ ...prev, employments: nextEmployments, employmentChanges: nextChanges }));
          setCareerEditorOpen(false);
        }}
      />

      <IndustryManagerModal
        open={industryManagerOpen}
        industries={state.industries}
        postings={state.jobPostings}
        onClose={() => setIndustryManagerOpen(false)}
        onSave={(next) => {
          setState((prev) => ({ ...prev, industries: next }));
          setIndustryManagerOpen(false);
        }}
      />

      <Modal
        open={postingModalOpen}
        title={editingPostingId ? "Edit Posting" : "Add Posting"}
        onClose={() => {
          setPostingModalOpen(false);
          resetPostingDraft();
        }}
        closeOnBackdrop
        closeOnEsc
        panelClassName="!max-w-[980px]"
        actions={
          <>
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={() => { setPostingModalOpen(false); resetPostingDraft(); }}>Cancel</button>
            <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={savePosting}>Save</button>
          </>
        }
      >
        <div className="grid gap-2 md:grid-cols-2">
          <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Company" value={postingDraft.companyName} onChange={(e) => setPostingDraft((prev) => ({ ...prev, companyName: e.target.value }))} />
          <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Posting Title" value={postingDraft.postingTitle} onChange={(e) => setPostingDraft((prev) => ({ ...prev, postingTitle: e.target.value }))} />
          <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Role" value={postingDraft.role} onChange={(e) => setPostingDraft((prev) => ({ ...prev, role: e.target.value }))} />
          <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Contract Type" value={postingDraft.contractType} onChange={(e) => setPostingDraft((prev) => ({ ...prev, contractType: e.target.value }))} />
          <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={postingDraft.industryId ?? ""} onChange={(e) => setPostingDraft((prev) => ({ ...prev, industryId: e.target.value || null }))}>
            <option value="">Uncategorized</option>
            {state.industries.map((industry) => <option key={industry.industryId} value={industry.industryId}>{industry.name}</option>)}
          </select>
          <select className="lifnux-select rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={postingDraft.importance} onChange={(e) => setPostingDraft((prev) => ({ ...prev, importance: e.target.value as Importance }))}>
            <option value="LOW">LOW</option>
            <option value="MID">MID</option>
            <option value="HIGH">HIGH</option>
          </select>
          <input type="date" className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={postingDraft.deadline ?? ""} onChange={(e) => setPostingDraft((prev) => ({ ...prev, deadline: e.target.value || null }))} />
          <input className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Link" value={postingDraft.link ?? ""} onChange={(e) => setPostingDraft((prev) => ({ ...prev, link: e.target.value || null }))} />
          <input className="md:col-span-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Department info" value={postingDraft.departmentInfo} onChange={(e) => setPostingDraft((prev) => ({ ...prev, departmentInfo: e.target.value }))} />
          <textarea rows={2} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Responsibilities" value={postingDraft.responsibilities} onChange={(e) => setPostingDraft((prev) => ({ ...prev, responsibilities: e.target.value }))} />
          <textarea rows={2} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Requirements" value={postingDraft.requirements} onChange={(e) => setPostingDraft((prev) => ({ ...prev, requirements: e.target.value }))} />
          <textarea rows={2} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Preferred" value={postingDraft.preferred} onChange={(e) => setPostingDraft((prev) => ({ ...prev, preferred: e.target.value }))} />
          <textarea rows={2} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Memo" value={postingDraft.memo} onChange={(e) => setPostingDraft((prev) => ({ ...prev, memo: e.target.value }))} />
          <textarea rows={2} className="md:col-span-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" placeholder="Comment" value={postingDraft.comment} onChange={(e) => setPostingDraft((prev) => ({ ...prev, comment: e.target.value }))} />
        </div>
      </Modal>

      <ApplicationModal
        open={applicationModalOpen}
        application={selectedApplication}
        posting={selectedApplicationPosting}
        readOnly={applicationReadOnly}
        onClose={() => {
          setApplicationModalOpen(false);
          setSelectedApplicationId(null);
        }}
        onSave={(next) => {
          const normalized = autoDoneOnFinal(next);
          setState((prev) => ({
            ...prev,
            applications: prev.applications.map((item) => (item.applicationId === normalized.applicationId ? normalized : item))
          }));
          if (normalized.status === "DONE") setViewMode("DONE");
          setApplicationModalOpen(false);
          setSelectedApplicationId(null);
        }}
        onReopen={(applicationId) => {
          setState((prev) => ({
            ...prev,
            applications: prev.applications.map((item) => {
              if (item.applicationId !== applicationId) return item;
              return {
                ...item,
                status: "IN_PROGRESS",
                finalResult: null,
                stages: item.stages.map((stage) =>
                  stage.type === "FINAL" ? { ...stage, result: "PENDING", resultAt: null } : stage
                )
              };
            })
          }));
          setViewMode("IN_PROGRESS");
          setApplicationModalOpen(false);
          setSelectedApplicationId(null);
        }}
      />

      <ConfirmModal
        open={Boolean(pendingDeletePostingId)}
        title="Delete Posting"
        description="Delete this posting?"
        detail="If linked applications exist, deletion is blocked."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setPendingDeletePostingId(null)}
        onConfirm={() => {
          if (!pendingDeletePostingId) return;
          const hasApp = state.applications.some((app) => app.postingId === pendingDeletePostingId);
          if (hasApp) {
            window.alert("Cannot delete: this posting is already referenced by applications.");
            setPendingDeletePostingId(null);
            return;
          }
          setState((prev) => ({ ...prev, jobPostings: prev.jobPostings.filter((item) => item.postingId !== pendingDeletePostingId) }));
          setPendingDeletePostingId(null);
        }}
      />

      <ConfirmModal
        open={seedConfirmOpen}
        title="Generate Test Data"
        description="Replace current Career data with seed data?"
        detail="This overwrites employments, changes, industries, postings, and applications."
        confirmLabel="Generate"
        cancelLabel="Cancel"
        variant="default"
        onCancel={() => setSeedConfirmOpen(false)}
        onConfirm={() => {
          setState(generateCareerSeedData());
          setViewMode("JOB_POSTINGS");
          setSortMode("updatedAt");
          setSeedConfirmOpen(false);
        }}
      />
    </AppShell>
  );
}
