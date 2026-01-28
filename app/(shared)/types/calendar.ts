export type Importance = "LOW" | "MIDDLE" | "HIGH" | "CRITICAL";

export type Label = {
  id: string;
  name: string;
  color: string;
};

export type RepeatRule = {
  daysOfWeek: number[];
  endDate?: string;
  excludeHolidays?: boolean;
};

export type RecurringRule = {
  id: string;
  title: string;
  type: "TIMED" | "DATE";
  startDate: string;
  daysOfWeek: number[];
  endDate?: string;
  excludeHolidays?: boolean;
  startTime?: string;
  endTime?: string;
  importance: Importance;
  labelId?: string;
  location?: string;
  memo?: string;
  exclusions?: string[];
  createdAt: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: "TIMED" | "DATE";
  startTime?: string;
  endTime?: string;
  importance: Importance;
  labelId?: string;
  location?: string;
  memo?: string;
  repeat?: RepeatRule;
  recurringRuleId?: string;
};

export type HolidayEvent = {
  id: string;
  date: string;
  title: string;
  memo?: string;
  labelId?: string;
  createdAt: number;
  kind: "HOLIDAY";
};

export type ShoppingItem = {
  id: string;
  name: string;
  importance: "LOW" | "MIDDLE" | "HIGH";
  price?: number;
  memo?: string;
  completed?: boolean;
};
