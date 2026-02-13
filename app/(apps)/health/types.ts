export type ActivityTypeId =
  | "running"
  | "walking"
  | "bicycle"
  | "swimming"
  | "home"
  | "soccer"
  | "gym"
  | "tennis"
  | "test_distance"
  | "test_count";
export type ActivityPlanMode = "unplanned" | "weekly" | "monthly";

export type ActivityType = {
  id: ActivityTypeId;
  name: string;
  icon: string;
  planMode: ActivityPlanMode;
  weeklyTargetCount: number;
  monthlyTargetCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ActivityLog = {
  id: string;
  typeId: ActivityTypeId;
  loggedForDate: string;
  durationMin?: number;
  memo?: string;
  createdAt: string;
  distanceKm?: number;
  paceText?: string;
  cadence?: number;
  maxSpeedKmh?: number;
  calorieOverride?: number;
};

export type ActivityLogDraft = {
  typeId: ActivityTypeId;
  loggedForDate: string;
  durationMin?: number;
  memo?: string;
  distanceKm?: number;
  paceText?: string;
  cadence?: number;
  maxSpeedKmh?: number;
  calorieOverride?: number;
};

export type ActivityWeeklyTarget = {
  id: string;
  typeId: ActivityTypeId;
  weekKey: string;
  targetCount: number;
  createdAt: string;
  updatedAt: string;
};
