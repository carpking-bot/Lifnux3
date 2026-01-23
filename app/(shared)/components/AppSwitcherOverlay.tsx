"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { LifnuxLauncher } from "./LifnuxLauncher";
import {
  CalendarDays,
  Music2,
  Gamepad2,
  Landmark,
  Dumbbell,
  Activity,
  BriefcaseBusiness,
  Sparkles,
  X
} from "lucide-react";

const apps = [
  { key: "calendar", label: "CALENDAR", href: "/calendar", icon: CalendarDays },
  { key: "music", label: "MUSIC", href: "/music", icon: Music2 },
  { key: "gaming", label: "GAMING", href: "/gaming", icon: Gamepad2 },
  { key: "finance", label: "FINANCE", href: "/finance", icon: Landmark },
  { key: "sport", label: "SPORT", href: "/sport", icon: Dumbbell },
  { key: "running", label: "RUNNING", href: "/running", icon: Activity },
  { key: "career", label: "CAREER", href: "/career", icon: BriefcaseBusiness },
  { key: "growth", label: "PERSONAL GROWTH", href: "/personal-growth", icon: Sparkles }
];

const OUTER_RING_RADIUS = 190;
const OUTER_RING_THICKNESS = 42;
const ICON_SIZE = 58;
const CORE_RADIUS = 96;

export function AppSwitcherOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const orbitRadius = OUTER_RING_RADIUS + OUTER_RING_THICKNESS / 2;
  const orbitDiameter = orbitRadius * 2 + ICON_SIZE;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_top,_#20324b_0%,_#0b121c_55%,_#080c13_100%)]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative"
            style={{ width: orbitDiameter, height: orbitDiameter }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <LifnuxLauncher
              mode="overlay"
              orbitApps={apps}
              outerRingRadius={OUTER_RING_RADIUS}
              outerRingThickness={OUTER_RING_THICKNESS}
              coreRadius={CORE_RADIUS}
              iconSize={ICON_SIZE}
              showCloseButton
              closeButton={
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full lifnux-glass text-white"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </button>
              }
              onNavigate={(href) => {
                router.push(href);
                onClose();
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
