"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  panelClassName?: string;
  titleClassName?: string;
  contentClassName?: string;
  closeButtonClassName?: string;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
  closeOnBackdrop,
  closeOnEsc,
  panelClassName,
  titleClassName,
  contentClassName,
  closeButtonClassName
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, closeOnEsc, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (!containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (!closeOnBackdrop) return;
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={containerRef}
            className={`w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl lifnux-glass p-6 ${panelClassName ?? ""}`}
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
          >
            <div className="flex items-center justify-between">
              <h2 className={`text-xl ${titleClassName ?? ""}`}>{title}</h2>
              <button
                className={`text-sm text-[var(--ink-1)] ${closeButtonClassName ?? ""}`}
                onClick={onClose}
                aria-label="Close"
              >
                X
              </button>
            </div>
            <div className={`mt-4 space-y-4 text-sm text-[var(--ink-1)] ${contentClassName ?? ""}`}>{children}</div>
            {actions ? <div className="mt-6 flex justify-end gap-3">{actions}</div> : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
