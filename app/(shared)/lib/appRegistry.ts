import {
  CalendarDays,
  Music2,
  Gamepad2,
  Landmark,
  Dumbbell,
  Activity,
  BriefcaseBusiness,
  Sparkles
} from "lucide-react";
import type { OrbitApp } from "../components/LifnuxOrbit";

export const coreApps: OrbitApp[] = [
  { key: "calendar", label: "CALENDAR", href: "/calendar", icon: CalendarDays },
  { key: "music", label: "MUSIC", href: "/music", icon: Music2 },
  { key: "gaming", label: "GAMING", href: "/gaming", icon: Gamepad2 },
  { key: "finance", label: "FINANCE", href: "/finance", icon: Landmark },
  { key: "sport", label: "SPORT", href: "/sport", icon: Dumbbell },
  { key: "running", label: "RUNNING", href: "/running", icon: Activity },
  { key: "career", label: "CAREER", href: "/career", icon: BriefcaseBusiness },
  { key: "growth", label: "PERSONAL GROWTH", href: "/personal-growth", icon: Sparkles }
];
