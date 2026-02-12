import type { Goal, ProgressUpdate, WeeklyChecklistState } from "../types";

type Props = {
  goal: Goal | null;
  updates: ProgressUpdate[];
  checklistStates: WeeklyChecklistState[];
  weekKey: string;
  onClose: () => void;
  onOpenUpdate: (goal: Goal) => void;
  onToggleChecklist: (goalId: string, itemId: string, checked: boolean) => void;
};

export function GoalDetailDrawer(_props: Props) {
  return null;
}
