"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LifnuxLauncher } from "./(shared)/components/LifnuxLauncher";
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

const modules = [
  { key: "calendar", label: "CALENDAR", href: "/calendar", icon: CalendarDays },
  { key: "music", label: "MUSIC", href: "/music", icon: Music2 },
  { key: "gaming", label: "GAMING", href: "/gaming", icon: Gamepad2 },
  { key: "finance", label: "FINANCE", href: "/finance", icon: Landmark },
  { key: "sport", label: "SPORT", href: "/sport", icon: Dumbbell },
  { key: "running", label: "RUNNING", href: "/running", icon: Activity },
  { key: "career", label: "CAREER", href: "/career", icon: BriefcaseBusiness },
  { key: "growth", label: "PERSONAL GROWTH", href: "/personal-growth", icon: Sparkles }
];

const OUTER_RING_RADIUS = 230;
const OUTER_RING_THICKNESS = 56;
const INNER_CORE_RADIUS = 120;
const ICON_SIZE = 62;
const TEXT_OFFSET = 104;
const DEBUG_DISABLE_ANIM = false;

function formatDateTime(now: Date) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(now);
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);
  return { date, time };
}

export default function HomePage() {
  const router = useRouter();
  const [now, setNow] = useState(() => formatDateTime(new Date()));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setNow(formatDateTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSelectStart = (href: string) => {
    console.log("[Lifnux] onClick", href);
  };

  const handleNavigate = (href: string) => {
    console.log("[Lifnux] push", href);
    router.push(href);
  };

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#20324b_0%,_#0b121c_55%,_#080c13_100%)]" />
      <div className="pointer-events-none absolute -top-40 left-10 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(90,214,208,0.25)_0%,_transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(90,120,214,0.22)_0%,_transparent_70%)] blur-2xl" />

      <section className="relative z-10 flex h-screen items-center justify-center">
        <LifnuxLauncher
          mode="home"
          orbitApps={modules}
          outerRingRadius={OUTER_RING_RADIUS}
          outerRingThickness={OUTER_RING_THICKNESS}
          coreRadius={INNER_CORE_RADIUS}
          iconSize={ICON_SIZE}
          textOffset={TEXT_OFFSET}
          disableAnimation={DEBUG_DISABLE_ANIM}
          homeDate={mounted ? now.date : undefined}
          homeTime={mounted ? now.time : undefined}
          onSelectStart={handleSelectStart}
          onNavigate={handleNavigate}
        />
      </section>
    </main>
  );
}
