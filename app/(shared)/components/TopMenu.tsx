"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Wrench } from "lucide-react";
import { AppSwitcherOverlay } from "./AppSwitcherOverlay";
import { AppLauncherOverlay } from "./AppLauncherOverlay";

export function TopMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);

  if (pathname === "/") return null;

  return (
    <>
      <div className="fixed right-4 top-4 z-40 flex items-center gap-2">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full lifnux-glass text-white"
          onClick={() => setLauncherOpen(true)}
          aria-label="Open app launcher"
        >
          <Wrench className="h-4 w-4" />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full lifnux-glass text-white"
          onClick={() => setOpen(true)}
          aria-label="Open app switcher"
        >
          <OrbitSwitcherIcon className="h-4 w-4" />
        </button>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full lifnux-glass text-white"
          onClick={() => router.push("/")}
          aria-label="Go home"
        >
          <Home className="h-4 w-4" />
        </button>
      </div>
      <AppSwitcherOverlay open={open} onClose={() => setOpen(false)} />
      <AppLauncherOverlay open={launcherOpen} onClose={() => setLauncherOpen(false)} />
    </>
  );
}

function OrbitSwitcherIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
