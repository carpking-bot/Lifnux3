export type Importance = "LOW" | "MIDDLE" | "HIGH" | "CRITICAL";

export type Label = {
  id: string;
  name: string;
  color: string;
};

export type RepeatRule = {
  daysOfWeek: number[];
  endDate: string;
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
};

export type HolidayEvent = {
  id: string;
  date: string;
  title: string;
  createdAt: number;
  kind: "HOLIDAY";
};

export type ShoppingItem = {
  id: string;
  name: string;
  importance: "LOW" | "MIDDLE" | "HIGH";
  memo?: string;
  completed?: boolean;
};
