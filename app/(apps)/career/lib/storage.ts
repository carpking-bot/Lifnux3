"use client";

import { loadState, saveState } from "../../../(shared)/lib/storage";
import { JOB_POSTING_CONTRACT_TYPES } from "../types";
import type { Application, CareerState, Employment, EmploymentChange, Industry, JobPosting, JobPostingContractType } from "../types";

export const CAREER_EMPLOYMENTS_KEY = "career_employments";
export const CAREER_EMPLOYMENT_CHANGES_KEY = "career_employment_changes";
export const CAREER_INDUSTRIES_KEY = "career_industries";
export const CAREER_JOB_POSTINGS_KEY = "career_job_postings";
export const CAREER_APPLICATIONS_KEY = "career_applications";

const CONTRACT_TYPE_MAP: Record<string, JobPostingContractType> = {
  "full-time": "정규직",
  fulltime: "정규직",
  "정규직": "정규직",
  contract: "계약직",
  "계약직": "계약직",
  "short-term": "단기계약직",
  "short term": "단기계약직",
  "단기계약직": "단기계약직",
  parttime: "아르바이트",
  "part-time": "아르바이트",
  "아르바이트": "아르바이트",
  intern: "인턴",
  internship: "인턴",
  "인턴": "인턴"
};

function normalizeContractType(raw: unknown): JobPostingContractType {
  if (typeof raw !== "string") return "정규직";
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return "정규직";
  if ((JOB_POSTING_CONTRACT_TYPES as string[]).includes(raw.trim())) return raw.trim() as JobPostingContractType;
  return CONTRACT_TYPE_MAP[normalized] ?? "정규직";
}

function normalizeImportance(raw: unknown): number {
  if (raw === "LOW") return 3;
  if (raw === "MID") return 6;
  if (raw === "HIGH") return 9;
  if (typeof raw === "number") return Math.min(10, Math.max(1, Math.round(raw)));
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.min(10, Math.max(1, Math.round(parsed)));
  }
  return 6;
}

function normalizePosting(raw: unknown): JobPosting | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Record<keyof JobPosting, unknown>>;
  const postingId = typeof item.postingId === "string" && item.postingId ? item.postingId : crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    postingId,
    industryId: typeof item.industryId === "string" && item.industryId ? item.industryId : null,
    companyName: typeof item.companyName === "string" ? item.companyName : "",
    postingTitle: typeof item.postingTitle === "string" ? item.postingTitle : "",
    role: typeof item.role === "string" ? item.role : "",
    contractType: normalizeContractType(item.contractType),
    departmentInfo: typeof item.departmentInfo === "string" ? item.departmentInfo : "",
    responsibilities: typeof item.responsibilities === "string" ? item.responsibilities : "",
    requirements: typeof item.requirements === "string" ? item.requirements : "",
    neededSkills:
      typeof item.neededSkills === "string"
        ? item.neededSkills
        : typeof item.requirements === "string"
          ? item.requirements
          : "",
    preferred: typeof item.preferred === "string" ? item.preferred : "",
    memo: typeof item.memo === "string" ? item.memo : "",
    comment: typeof item.comment === "string" ? item.comment : "",
    deadline: typeof item.deadline === "string" && item.deadline ? item.deadline : null,
    importance: normalizeImportance(item.importance),
    isFavorite: Boolean(item.isFavorite),
    link: typeof item.link === "string" && item.link ? item.link : null,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now
  };
}

function normalizeJobPostings(raw: unknown): JobPosting[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePosting(item))
    .filter((item): item is JobPosting => Boolean(item));
}

export function loadCareerState(): CareerState {
  const employments = loadState<Employment[]>(CAREER_EMPLOYMENTS_KEY, []);
  const employmentChanges = loadState<EmploymentChange[]>(CAREER_EMPLOYMENT_CHANGES_KEY, []);
  const industries = loadState<Industry[]>(CAREER_INDUSTRIES_KEY, []);
  const jobPostingsRaw = loadState<unknown[]>(CAREER_JOB_POSTINGS_KEY, []);
  const jobPostings = normalizeJobPostings(jobPostingsRaw);
  const applications = loadState<Application[]>(CAREER_APPLICATIONS_KEY, []);
  return { employments, employmentChanges, industries, jobPostings, applications };
}

export function saveCareerState(next: CareerState) {
  saveState(CAREER_EMPLOYMENTS_KEY, next.employments);
  saveState(CAREER_EMPLOYMENT_CHANGES_KEY, next.employmentChanges);
  saveState(CAREER_INDUSTRIES_KEY, next.industries);
  saveState(CAREER_JOB_POSTINGS_KEY, next.jobPostings);
  saveState(CAREER_APPLICATIONS_KEY, next.applications);
}

