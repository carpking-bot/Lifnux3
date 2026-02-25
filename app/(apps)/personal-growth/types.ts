export type GoalScope = "WEEKLY" | "MONTHLY" | "YEARLY" | "LIFETIME";
export type GoalType = "VALUE" | "COUNT" | "CHECKLIST";
export type GoalStatus = "NOT_STARTED" | "PROGRESSING" | "DONE" | "PAUSED" | "DROPPED";
export type Importance = "LOW" | "MIDDLE" | "HIGH";
export type TrackingMode = "MANUAL" | "LINKED";
export type GoalDisplayMode = "TARGET" | "TRACKER";

export type LinkedDisplayMode = "VALUE_ONLY" | "VALUE_AND_PROGRESS" | "CHECKLIST_HINT";

export type LinkedSource = {
  sourceApp: "HEALTH" | "ASSET" | "INVESTING" | "CAREER" | "GUITAR";
  sourceMetric: string;
  params?: Record<string, string | number | boolean>;
  displayMode: LinkedDisplayMode;
};

export type GoalMetric = {
  unit: string;
  startValue?: number;
  targetValue?: number;
};

export type GoalCountMetric = {
  countTarget: number;
  period: "WEEK" | "MONTH" | "YEAR" | "CUSTOM_RANGE";
  periodRange?: { start: string; end: string };
  unitLabel?: string;
  manualCount?: number;
};

export type ChecklistItem = {
  id: string;
  text: string;
  order?: number;
  isRequired?: boolean;
};

export type GoalDomain = {
  id: string;
  name: string;
  color: string;
  order: number;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  scope: GoalScope;
  domainId: string;
  title: string;
  startDate?: string;
  details: string;
  notes: string;
  links: string[];
  importance: Importance;
  status: GoalStatus;
  deadline?: string;
  goalType: GoalType;
  trackingMode: TrackingMode;
  displayMode: GoalDisplayMode;
  linkedSource?: LinkedSource;
  metric?: GoalMetric;
  countMetric?: GoalCountMetric;
  checklistItems?: ChecklistItem[];
  isArchived?: boolean;
};

export type ProgressUpdate = {
  id: string;
  goalId: string;
  loggedForDate: string;
  value?: number;
  summary: string;
  memo?: string;
  createdAt: string;
};

export type WeeklyChecklistState = {
  goalId: string;
  weekKey: string;
  checkedItemIds: string[];
};

export type GoalProgressSnapshot = {
  valueLabel: string;
  numericValue: number | null;
  percent: number | null;
};

export type LinkedMetricResult = {
  value: number | string;
  unit?: string;
  summary?: string;
};
