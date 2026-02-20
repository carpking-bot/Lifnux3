"use client";

import { loadState, saveState } from "../../../(shared)/lib/storage";
import type { Application, CareerState, Employment, EmploymentChange, Industry, JobPosting } from "../types";

export const CAREER_EMPLOYMENTS_KEY = "career_employments";
export const CAREER_EMPLOYMENT_CHANGES_KEY = "career_employment_changes";
export const CAREER_INDUSTRIES_KEY = "career_industries";
export const CAREER_JOB_POSTINGS_KEY = "career_job_postings";
export const CAREER_APPLICATIONS_KEY = "career_applications";

export function loadCareerState(): CareerState {
  const employments = loadState<Employment[]>(CAREER_EMPLOYMENTS_KEY, []);
  const employmentChanges = loadState<EmploymentChange[]>(CAREER_EMPLOYMENT_CHANGES_KEY, []);
  const industries = loadState<Industry[]>(CAREER_INDUSTRIES_KEY, []);
  const jobPostings = loadState<JobPosting[]>(CAREER_JOB_POSTINGS_KEY, []);
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
