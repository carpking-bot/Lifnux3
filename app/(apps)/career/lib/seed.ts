import type { Application, CareerState, Employment, EmploymentChange, Industry, JobPosting } from "../types";
import { createDefaultStageTemplate } from "./stageHelpers";

function ymd(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function isoNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createPosting(
  industryId: string | null,
  companyName: string,
  postingTitle: string,
  role: string,
  importance: JobPosting["importance"],
  deadlineOffset: number
): JobPosting {
  const now = isoNow();
  return {
    postingId: crypto.randomUUID(),
    industryId,
    companyName,
    postingTitle,
    role,
    contractType: "정규직",
    departmentInfo: "Product / Engineering",
    responsibilities: "Build and ship user features",
    requirements: "2+ years relevant experience",
    neededSkills: "TypeScript, React, communication",
    preferred: "Portfolio and communication skills",
    memo: "",
    comment: "",
    deadline: ymd(deadlineOffset),
    importance,
    isFavorite: false,
    link: "https://example.com",
    createdAt: now,
    updatedAt: now
  };
}

function createApp(postingId: string, appliedOffset: number, done = false, pass = false): Application {
  const stages = createDefaultStageTemplate();
  if (done) {
    for (const stage of stages) {
      stage.submittedAt = ymd(appliedOffset + 1);
      stage.resultAt = ymd(appliedOffset + 2);
      stage.result = stage.type === "FINAL" ? (pass ? "PASS" : "FAIL") : "PASS";
    }
  } else {
    stages[0].submittedAt = ymd(appliedOffset + 1);
    stages[0].resultAt = ymd(appliedOffset + 2);
    stages[0].result = "PASS";
    stages[1].submittedAt = ymd(appliedOffset + 4);
    stages[1].result = "PENDING";
  }
  return {
    applicationId: crypto.randomUUID(),
    postingId,
    appliedAt: ymd(appliedOffset),
    status: done ? "DONE" : "IN_PROGRESS",
    finalResult: done ? (pass ? "PASS" : "FAIL") : null,
    stages
  };
}

export function generateCareerSeedData(): CareerState {
  const industries: Industry[] = [
    { industryId: crypto.randomUUID(), name: "IT/Software" },
    { industryId: crypto.randomUUID(), name: "Healthcare" },
    { industryId: crypto.randomUUID(), name: "Finance" }
  ];

  const postings: JobPosting[] = [
    createPosting(industries[0].industryId, "Nexa Labs", "Frontend Engineer", "Frontend", 9, 14),
    createPosting(industries[0].industryId, "Pulse Cloud", "Fullstack Engineer", "Fullstack", 6, 21),
    createPosting(industries[1].industryId, "MediFlow", "Data Analyst", "Data", 3, 10),
    createPosting(industries[1].industryId, "BioTrack", "Product Manager", "PM", 6, 18),
    createPosting(industries[2].industryId, "Alpha Securities", "Quant Developer", "Quant", 9, 30),
    createPosting(industries[2].industryId, "Core Bank", "Backend Engineer", "Backend", 6, 7)
  ];

  const inProgress = [
    createApp(postings[0].postingId, -12, false, false),
    createApp(postings[1].postingId, -8, false, false),
    createApp(postings[2].postingId, -5, false, false)
  ];

  const doneApps = [
    createApp(postings[3].postingId, -50, true, true),
    createApp(postings[4].postingId, -70, true, false),
    createApp(postings[5].postingId, -30, true, true)
  ];

  const currentEmployment: Employment = {
    employmentId: crypto.randomUUID(),
    companyName: "Lifnux Labs",
    startDate: ymd(-520),
    endDate: null,
    contractType: "Full-time",
    isCurrent: true,
    remainingPTO: 12,
    notes: "Core product team"
  };

  const changes: EmploymentChange[] = [
    { changeId: crypto.randomUUID(), employmentId: currentEmployment.employmentId, effectiveDate: ymd(-520), department: "Platform", title: "Software Engineer", level: "L1", salaryKRW: 52000000, memo: "Joined" },
    { changeId: crypto.randomUUID(), employmentId: currentEmployment.employmentId, effectiveDate: ymd(-320), department: "Product", title: "Software Engineer", level: "L2", salaryKRW: 61000000, memo: "Moved to product" },
    { changeId: crypto.randomUUID(), employmentId: currentEmployment.employmentId, effectiveDate: ymd(-120), department: "Product", title: "Senior Engineer", level: "L3", salaryKRW: 76000000, memo: "Promotion" }
  ];

  return {
    employments: [currentEmployment],
    employmentChanges: changes,
    industries,
    jobPostings: postings,
    applications: [...inProgress, ...doneApps]
  };
}

