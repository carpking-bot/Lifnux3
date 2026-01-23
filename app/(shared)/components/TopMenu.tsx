"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Grid3X3, Home } from "lucide-react";
import { AppSwitcherOverlay } from "./AppSwitcherOverlay";

export function TopMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/") return null;

  return (
    <>
      <div className="fixed right-6 top-6 z-40 flex items-center gap-2">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full lifnux-glass text-white"
          onClick={() => setOpen(true)}
          aria-label="Open app switcher"
        >
          <Grid3X3 className="h-4 w-4" />
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
    </>
  );
}
