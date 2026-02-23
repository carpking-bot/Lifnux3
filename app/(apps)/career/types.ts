export type ContractType = "Full-time" | "Contract" | "Short-term Contract" | "Part-time" | "Intern" | "Other";
export type JobPostingContractType = "정규직" | "계약직" | "단기계약직" | "아르바이트" | "인턴";
export const JOB_POSTING_CONTRACT_TYPES: JobPostingContractType[] = ["정규직", "계약직", "단기계약직", "아르바이트", "인턴"];

export type Employment = {
  employmentId: string;
  companyName: string;
  startDate: string;
  endDate: string | null;
  contractType: ContractType;
  department?: string;
  title?: string;
  level?: string;
  salaryKRW?: number | null;
  isCurrent: boolean;
  remainingPTO: number | null;
  notes: string;
};

export type EmploymentChange = {
  changeId: string;
  employmentId: string;
  effectiveDate: string;
  department: string;
  title: string;
  level: string;
  salaryKRW: number | null;
  memo: string;
};

export type Industry = {
  industryId: string;
  name: string;
};

export type Importance = number;

export type JobPosting = {
  postingId: string;
  industryId: string | null;
  companyName: string;
  postingTitle: string;
  role: string;
  contractType: JobPostingContractType;
  departmentInfo: string;
  responsibilities: string;
  requirements: string;
  neededSkills: string;
  preferred: string;
  memo: string;
  comment: string;
  deadline: string | null;
  importance: Importance; // integer scale: 1..10
  isFavorite: boolean;
  link: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StageType = "DOCUMENT" | "INTERVIEW_1" | "INTERVIEW_2" | "FINAL" | "CUSTOM";

export type StageResult = "PENDING" | "PASS" | "FAIL";

export type Stage = {
  stageId: string;
  type: StageType;
  customLabel?: string;
  submittedAt: string | null;
  resultAt: string | null;
  result: StageResult;
  notes: string;
};

export type ApplicationStatus = "IN_PROGRESS" | "DONE";
export type FinalResult = "PASS" | "FAIL" | null;

export type Application = {
  applicationId: string;
  postingId: string;
  appliedAt: string;
  status: ApplicationStatus;
  finalResult: FinalResult;
  stages: Stage[];
};

export type CareerState = {
  employments: Employment[];
  employmentChanges: EmploymentChange[];
  industries: Industry[];
  jobPostings: JobPosting[];
  applications: Application[];
};

export const DEFAULT_CAREER_STATE: CareerState = {
  employments: [],
  employmentChanges: [],
  industries: [],
  jobPostings: [],
  applications: []
};


