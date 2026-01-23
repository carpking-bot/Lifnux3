"use client";

import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
};

export function Modal({ open, title, onClose, children, actions }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-xl rounded-2xl lifnux-glass p-6"
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl">{title}</h2>
              <button className="text-sm text-[var(--ink-1)]" onClick={onClose}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-[var(--ink-1)]">{children}</div>
            {actions ? <div className="mt-6 flex justify-end gap-3">{actions}</div> : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
