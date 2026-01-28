"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { BookOpen, FolderLock, Wand2, Guitar, X } from "lucide-react";

const extraApps = [
  { id: "guitar", name: "Guitar Practice", href: "/guitar", icon: Guitar },
  { id: "notes", name: "NOTES", href: "/notes", icon: BookOpen },
  { id: "vault", name: "VAULT", href: "/vault", icon: FolderLock },
  { id: "lab", name: "LAB", href: "/lab", icon: Wand2 }
];

export function AppLauncherOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[520px] rounded-3xl lifnux-glass p-6"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-[var(--ink-1)]">App Launcher</div>
                <div className="text-lg">Extra Applications</div>
              </div>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full lifnux-glass text-white"
                onClick={onClose}
                aria-label="Close launcher"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {extraApps.map((app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-center text-xs uppercase tracking-[0.2em] text-[var(--ink-0)] transition hover:border-white/30"
                    onClick={() => {
                      router.push(app.href);
                      onClose();
                    }}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    {app.name}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
