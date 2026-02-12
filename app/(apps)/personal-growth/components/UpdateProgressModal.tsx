import type { Goal, ProgressUpdate } from "../types";

type Props = {
  goal: Goal | null;
  open: boolean;
  onClose: () => void;
  onSave: (update: ProgressUpdate) => void;
};

export function UpdateProgressModal(_props: Props) {
  return null;
}
