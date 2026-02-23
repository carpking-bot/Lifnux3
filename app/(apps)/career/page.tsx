"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import { loadState } from "../../(shared)/lib/storage";
import { ApplicationModal } from "./components/ApplicationModal";
import { ApplicationAnalysisModal } from "./components/ApplicationAnalysisModal";
import { CareerEditorModal } from "./components/CareerEditorModal";
import { CareerOverviewModal } from "./components/CareerOverviewModal";
import { CareerStatusCard } from "./components/CareerStatusCard";
import { DoneView } from "./components/DoneView";
import { IndustryManagerModal } from "./components/IndustryManagerModal";
import { InProgressView } from "./components/InProgressView";
import { JobPostingEditorDrawer } from "./components/JobPostingEditorDrawer";
import { JobPostingsView } from "./components/JobPostingsView";
import { generateCareerSeedData } from "./lib/seed";
import { loadCareerState, saveCareerState } from "./lib/storage";
import { autoDoneOnFinal, createDefaultStageTemplate, latestStageResultDate, updatedAtForApplication } from "./lib/stageHelpers";
import type { Application, CareerState, Employment, EmploymentChange, JobPosting, JobPostingContractType } from "./types";
import type { DocumentLeadTimeDetail, DocumentOutcomeDetail } from "./components/ApplicationAnalysisModal";

type ViewMode = "JOB_POSTINGS" | "IN_PROGRESS" | "DONE";
type SortMode = "importanceDesc" | "importanceAsc" | "deadline" | "updatedAt" | "appliedAt" | "nextPendingStage" | "resultAt";
type PostingDrawerMode = "view" | "edit" | "create";
const CALENDAR_HOLIDAY_KEY = "lifnux.calendar.holidays.v100";

function toYmd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseDateMs(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NaN;
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return NaN;
  const ms = new Date(`${dateKey}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function buildFixedHolidaySet(year: number) {
  return new Set([
    `${year}-01-01`,
    `${year}-03-01`,
    `${year}-05-05`,
    `${year}-06-06`,
    `${year}-08-15`,
    `${year}-10-03`,
    `${year}-10-09`,
    `${year}-12-25`
  ]);
}

function businessDaysExclusiveStart(startDate: string, endDate: string, holidaySet: Set<string>) {
  const startMs = parseDateMs(startDate);
  const endMs = parseDateMs(endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  const totalSpanDays = Math.floor((endMs - startMs) / 86400000);
  if (totalSpanDays > 5000) return null;

  const rangeStart = startMs + 86400000;
  if (rangeStart > endMs) return 0;

  const totalDays = Math.floor((endMs - rangeStart) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let businessDays = fullWeeks * 5;
  const remainder = totalDays % 7;
  const startDay = new Date(rangeStart).getDay();

  for (let i = 0; i < remainder; i += 1) {
    const day = (startDay + i) % 7;
    if (day !== 0 && day !== 6) businessDays += 1;
  }

  let holidayWeekdaysInRange = 0;
  holidaySet.forEach((dateKey) => {
    const ms = parseDateMs(dateKey);
    if (!Number.isFinite(ms)) return;
    if (ms < rangeStart || ms > endMs) return;
    const day = new Date(ms).getDay();
    if (day === 0 || day === 6) return;
    holidayWeekdaysInRange += 1;
  });

  return Math.max(0, businessDays - holidayWeekdaysInRange);
}

function buildAnalysisData(
  applications: Application[],
  postingMap: Map<string, JobPosting>,
  industryNameMap: Map<string, string>
) {
  const holidaySet = new Set<string>();
  const customHolidays = loadState<{ date?: unknown }[]>(CALENDAR_HOLIDAY_KEY, []);
  customHolidays.forEach((item) => {
    if (typeof item?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) holidaySet.add(item.date);
  });

  const years = new Set<number>([new Date().getFullYear()]);
  applications.forEach((application) => {
    application.stages.forEach((stage) => {
      if (stage.submittedAt && stage.submittedAt.length >= 4) years.add(Number(stage.submittedAt.slice(0, 4)));
      if (stage.resultAt && stage.resultAt.length >= 4) years.add(Number(stage.resultAt.slice(0, 4)));
    });
  });
  years.forEach((year) => {
    if (!Number.isFinite(year)) return;
    buildFixedHolidaySet(year).forEach((dateKey) => holidaySet.add(dateKey));
  });

  const outcomeDetails: DocumentOutcomeDetail[] = [];
  const leadTimeDetails: DocumentLeadTimeDetail[] = [];

  applications.forEach((application) => {
    const documentStage = application.stages.find((stage) => stage.type === "DOCUMENT");
    if (!documentStage) return;
    if (documentStage.result !== "PASS" && documentStage.result !== "FAIL") return;
    const posting = postingMap.get(application.postingId);
    const companyName = posting?.companyName ?? "알 수 없음";
    const postingTitle = posting?.postingTitle ?? "공고 없음";

    outcomeDetails.push({
      applicationId: application.applicationId,
      companyName,
      postingTitle,
      submittedAt: documentStage.submittedAt,
      resultAt: documentStage.resultAt,
      result: documentStage.result,
      posting: posting
        ? {
            industry: posting.industryId ? industryNameMap.get(posting.industryId) ?? "미분류" : "미분류",
            role: posting.role,
            contractType: posting.contractType,
            departmentInfo: posting.departmentInfo,
            requirements: posting.requirements,
            neededSkills: posting.neededSkills,
            preferred: posting.preferred,
            memo: posting.memo,
            comment: posting.comment
          }
        : undefined
    });

    if (!documentStage.submittedAt || !documentStage.resultAt) return;
    const businessDays = businessDaysExclusiveStart(documentStage.submittedAt, documentStage.resultAt, holidaySet);
    if (businessDays === null) return;
    leadTimeDetails.push({
      applicationId: application.applicationId,
      companyName,
      postingTitle,
      submittedAt: documentStage.submittedAt,
      resultAt: documentStage.resultAt,
      businessDays,
      result: documentStage.result
    });
  });

  const passCount = outcomeDetails.filter((item) => item.result === "PASS").length;
  const failCount = outcomeDetails.filter((item) => item.result === "FAIL").length;
  const avgBusinessDays = leadTimeDetails.length > 0
    ? leadTimeDetails.reduce((acc, item) => acc + item.businessDays, 0) / leadTimeDetails.length
    : null;

  leadTimeDetails.sort((a, b) => b.businessDays - a.businessDays);

  return { passCount, failCount, outcomeDetails, avgBusinessDays, leadTimeDetails };
}

function tenureDays(startDate: string, endDate: string | null) {
  const s = new Date(`${startDate}T00:00:00`).getTime();
  const e = new Date(`${endDate ?? toYmd()}T00:00:00`).getTime();
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
    contractType: "정규직",
    departmentInfo: "",
    responsibilities: "",
    requirements: "",
    neededSkills: "",
    preferred: "",
    memo: "",
    comment: "",
    deadline: null,
    importance: 6,
    isFavorite: false,
    link: null,
    createdAt: now,
    updatedAt: now
  };
}

export default function CareerPage() {
  const [state, setState] = useState<CareerState>({ employments: [], employmentChanges: [], industries: [], jobPostings: [], applications: [] });
  const [loaded, setLoaded] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("JOB_POSTINGS");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updatedAt");

  const [industryFilter, setIndustryFilter] = useState("");
  const [contractFilter, setContractFilter] = useState<JobPostingContractType | "">("");
  const [roleFilter, setRoleFilter] = useState("");

  const [careerEditorOpen, setCareerEditorOpen] = useState(false);
  const [careerOverviewOpen, setCareerOverviewOpen] = useState(false);
  const [industryManagerOpen, setIndustryManagerOpen] = useState(false);

  const [postingEditorOpen, setPostingEditorOpen] = useState(false);
  const [postingDraft, setPostingDraft] = useState<JobPosting>(emptyPosting());
  const [editingPostingId, setEditingPostingId] = useState<string | null>(null);
  const [postingDrawerMode, setPostingDrawerMode] = useState<PostingDrawerMode>("create");
  const [pendingDeletePostingId, setPendingDeletePostingId] = useState<string | null>(null);

  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [applicationReadOnly, setApplicationReadOnly] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState<{
    passCount: number;
    failCount: number;
    outcomeDetails: DocumentOutcomeDetail[];
    avgBusinessDays: number | null;
    leadTimeDetails: DocumentLeadTimeDetail[];
  }>({
    passCount: 0,
    failCount: 0,
    outcomeDetails: [],
    avgBusinessDays: null,
    leadTimeDetails: []
  });

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
  const industryNameMap = useMemo(() => new Map(state.industries.map((item) => [item.industryId, item.name])), [state.industries]);
  const applicationPostingIds = useMemo(() => new Set(state.applications.map((app) => app.postingId)), [state.applications]);

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
  const totalCareerDays = useMemo(() => {
    if (!state.employments.length) return 0;
    return state.employments.reduce((sum, employment) => {
      return sum + tenureDays(employment.startDate, employment.endDate);
    }, 0);
  }, [state.employments]);

  const searchedPostings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.jobPostings.filter((posting) => {
      // Once an application is created, the posting is managed via In Progress/Done views.
      if (applicationPostingIds.has(posting.postingId)) return false;
      if (industryFilter && posting.industryId !== industryFilter) return false;
      if (contractFilter && posting.contractType !== contractFilter) return false;
      if (roleFilter.trim() && !posting.role.toLowerCase().includes(roleFilter.trim().toLowerCase())) return false;
      if (!keyword) return true;
      return (
        posting.companyName.toLowerCase().includes(keyword) ||
        posting.postingTitle.toLowerCase().includes(keyword) ||
        posting.role.toLowerCase().includes(keyword)
      );
    });
  }, [state.jobPostings, search, industryFilter, contractFilter, roleFilter, applicationPostingIds]);

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
    const byFavorite = (a: JobPosting, b: JobPosting) => {
      if (a.isFavorite === b.isFavorite) return 0;
      return a.isFavorite ? -1 : 1;
    };
    if (sortMode === "importanceDesc") {
      next.sort((a, b) => byFavorite(a, b) || b.importance - a.importance);
      return next;
    }
    if (sortMode === "importanceAsc") {
      next.sort((a, b) => byFavorite(a, b) || a.importance - b.importance);
      return next;
    }
    if (sortMode === "deadline") {
      next.sort((a, b) => byFavorite(a, b) || (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));
      return next;
    }
    next.sort((a, b) => byFavorite(a, b) || b.updatedAt.localeCompare(a.updatedAt));
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

  useEffect(() => {
    if (!analysisOpen) return;
    setAnalysisLoading(true);
    const timer = window.setTimeout(() => {
      setAnalysisData(buildAnalysisData(state.applications, postingMap, industryNameMap));
      setAnalysisLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analysisOpen, state.applications, postingMap, industryNameMap]);

  const selectedApplication = useMemo(
    () => state.applications.find((item) => item.applicationId === selectedApplicationId) ?? null,
    [state.applications, selectedApplicationId]
  );
  const selectedApplicationPosting = useMemo(
    () => (selectedApplication ? postingMap.get(selectedApplication.postingId) ?? null : null),
    [selectedApplication, postingMap]
  );

  const resetPostingDraft = () => {
    setEditingPostingId(null);
    setPostingDrawerMode("create");
    setPostingDraft(emptyPosting());
  };

  const deletePostingById = (postingId: string): string | null => {
    const hasApp = state.applications.some((app) => app.postingId === postingId);
    if (hasApp) return "삭제할 수 없습니다. 이미 지원 내역에서 사용 중인 공고입니다.";
    setState((prev) => ({ ...prev, jobPostings: prev.jobPostings.filter((item) => item.postingId !== postingId) }));
    if (editingPostingId === postingId) {
      setPostingEditorOpen(false);
      resetPostingDraft();
    }
    return null;
  };

  const savePosting = (nextPosting: JobPosting) => {
    if (!nextPosting.companyName.trim() || !nextPosting.postingTitle.trim() || !nextPosting.role.trim()) return;
    const now = new Date().toISOString();
    if (editingPostingId) {
      setState((prev) => ({
        ...prev,
        jobPostings: prev.jobPostings.map((item) =>
          item.postingId === editingPostingId
            ? {
                ...nextPosting,
                postingId: editingPostingId,
                createdAt: item.createdAt,
                updatedAt: now
              }
            : item
        )
      }));
    } else {
      setState((prev) => ({
        ...prev,
        jobPostings: [
          {
            ...nextPosting,
            postingId: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now
          },
          ...prev.jobPostings
        ]
      }));
    }
    setPostingEditorOpen(false);
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

  const togglePostingFavorite = (postingId: string) => {
    setState((prev) => ({
      ...prev,
      jobPostings: prev.jobPostings.map((item) =>
        item.postingId === postingId ? { ...item, isFavorite: !item.isFavorite, updatedAt: new Date().toISOString() } : item
      )
    }));
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[2200px] pb-20 pt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl">Career</h1>
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
            totalCareerDays={totalCareerDays}
            onOpenOverview={() => setCareerOverviewOpen(true)}
            onOpenEditor={() => setCareerEditorOpen(true)}
          />

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-white/15 bg-black/20 p-1 text-sm">
                <button
                  className={`rounded-full px-3 py-1.5 ${viewMode === "JOB_POSTINGS" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`}
                  onClick={() => {
                    setViewMode("JOB_POSTINGS");
                    setSortMode("updatedAt");
                  }}
                >
                  채용 공고
                </button>
                <button
                  className={`rounded-full px-3 py-1.5 ${viewMode === "IN_PROGRESS" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`}
                  onClick={() => {
                    setViewMode("IN_PROGRESS");
                    setSortMode("updatedAt");
                  }}
                >
                  진행 중
                </button>
                <button
                  className={`rounded-full px-3 py-1.5 ${viewMode === "DONE" ? "bg-cyan-300/20 text-cyan-200" : "text-[var(--ink-1)]"}`}
                  onClick={() => {
                    setViewMode("DONE");
                    setSortMode("resultAt");
                  }}
                >
                  완료
                </button>
              </div>

              <input
                className="rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm"
                placeholder="회사/공고명/직무 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select className="lifnux-select rounded-full border border-white/20 bg-black/30 px-4 py-2 text-sm" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                {viewMode === "JOB_POSTINGS" ? (
                  <>
                    <option value="importanceDesc">중요도 높은순</option>
                    <option value="importanceAsc">중요도 낮은순</option>
                    <option value="deadline">마감일순</option>
                    <option value="updatedAt">최근 수정순</option>
                  </>
                ) : null}
                {viewMode === "IN_PROGRESS" ? (
                  <>
                    <option value="appliedAt">지원일순</option>
                    <option value="nextPendingStage">다음 진행 단계순</option>
                    <option value="updatedAt">최근 업데이트순</option>
                  </>
                ) : null}
                {viewMode === "DONE" ? (
                  <>
                    <option value="resultAt">결과일순</option>
                    <option value="appliedAt">지원일순</option>
                  </>
                ) : null}
              </select>

              <button className="ml-auto rounded-full border border-emerald-300/60 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300" onClick={() => setAnalysisOpen(true)}>
                지원 분석
              </button>
              <button className="rounded-full border border-white/20 px-4 py-2 text-sm text-[var(--ink-1)]" onClick={() => setIndustryManagerOpen(true)}>
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
                  setPostingDrawerMode("create");
                  setPostingEditorOpen(true);
                }}
                onEdit={(posting) => {
                  setEditingPostingId(posting.postingId);
                  setPostingDrawerMode("view");
                  setPostingDraft(posting);
                  setPostingEditorOpen(true);
                }}
                onDelete={(posting) => setPendingDeletePostingId(posting.postingId)}
                onToggleFavorite={(posting) => togglePostingFavorite(posting.postingId)}
              />
            ) : null}

            {viewMode === "IN_PROGRESS" ? (
              <InProgressView
                applications={sortedInProgress}
                postingMap={postingMap}
                industryNameMap={industryNameMap}
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
                industryNameMap={industryNameMap}
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

      <CareerOverviewModal
        open={careerOverviewOpen}
        employments={state.employments}
        changes={state.employmentChanges}
        onClose={() => setCareerOverviewOpen(false)}
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

      <JobPostingEditorDrawer
        open={postingEditorOpen}
        posting={postingDraft}
        isEditing={Boolean(editingPostingId)}
        initialMode={postingDrawerMode}
        industries={state.industries}
        onClose={() => {
          setPostingEditorOpen(false);
          resetPostingDraft();
        }}
        onSave={savePosting}
        onApply={(posting) => {
          applyToPosting(posting);
          setPostingEditorOpen(false);
          resetPostingDraft();
        }}
        onDelete={deletePostingById}
        onManageIndustries={() => setIndustryManagerOpen(true)}
      />

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

      <ApplicationAnalysisModal
        open={analysisOpen}
        loading={analysisLoading}
        passCount={analysisData.passCount}
        failCount={analysisData.failCount}
        outcomeDetails={analysisData.outcomeDetails}
        avgBusinessDays={analysisData.avgBusinessDays}
        leadTimeDetails={analysisData.leadTimeDetails}
        onClose={() => setAnalysisOpen(false)}
      />

      <ConfirmModal
        open={Boolean(pendingDeletePostingId)}
        title="공고 삭제"
        description="이 공고를 삭제할까요?"
        detail="지원 내역과 연결된 공고는 삭제할 수 없습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onCancel={() => setPendingDeletePostingId(null)}
        onConfirm={() => {
          if (!pendingDeletePostingId) return;
          const error = deletePostingById(pendingDeletePostingId);
          if (error) window.alert(error);
          setPendingDeletePostingId(null);
        }}
      />

      <ConfirmModal
        open={seedConfirmOpen}
        title="테스트 데이터 생성"
        description="현재 커리어 데이터를 테스트 데이터로 교체할까요?"
        detail="경력/변경 이력/카테고리/공고/지원 데이터가 모두 덮어써집니다."
        confirmLabel="생성"
        cancelLabel="취소"
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

