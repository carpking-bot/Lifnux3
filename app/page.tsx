"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LifnuxLauncher } from "./(shared)/components/LifnuxLauncher";
import { AppLauncherOverlay } from "./(shared)/components/AppLauncherOverlay";
import { Wrench } from "lucide-react";
import { coreApps } from "./(shared)/lib/appRegistry";

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
  const [launcherOpen, setLauncherOpen] = useState(false);

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
          orbitApps={coreApps}
          outerRingRadius={OUTER_RING_RADIUS}
          outerRingThickness={OUTER_RING_THICKNESS}
          coreRadius={INNER_CORE_RADIUS}
          iconSize={ICON_SIZE}
          textOffset={TEXT_OFFSET}
          disableAnimation={DEBUG_DISABLE_ANIM}
          homeDate={mounted ? now.date : undefined}
          homeTime={mounted ? now.time : undefined}
          centerButton={
            <button
              className="group relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_0_24px_rgba(90,214,208,0.4)]"
              onClick={() => setLauncherOpen(true)}
              aria-label="Open app launcher"
            >
              <span className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25)_0%,_transparent_60%)] opacity-80" />
              <span className="absolute inset-[3px] rounded-[16px] border border-white/10 bg-black/40" />
              <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 group-hover:bg-white/20">
                <Wrench className="h-5 w-5" />
              </span>
            </button>
          }
          onSelectStart={handleSelectStart}
          onNavigate={handleNavigate}
        />
      </section>

      <AppLauncherOverlay open={launcherOpen} onClose={() => setLauncherOpen(false)} />
    </main>
  );
}
