"use client";

import { useRef, useState } from "react";
import { ConfirmModal } from "../(shared)/components/ConfirmModal";
import {
  downloadLifnuxExport,
  importLifnuxExport,
  validateLifnuxExport
} from "../(shared)/lib/persistence";

type ToastState = { type: "success" | "error"; message: string } | null;

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (next: ToastState) => {
    setToast(next);
    if (next) {
      window.setTimeout(() => setToast(null), 2400);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[960px] px-6 pb-16 pt-12">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--ink-1)]">Settings</div>
          <h1 className="mt-2 text-4xl">SETTINGS</h1>
        </div>

        {toast ? (
          <div className="mb-6 lifnux-glass rounded-2xl px-4 py-3 text-sm text-[var(--ink-1)]">
            <span className={toast.type === "success" ? "text-[var(--accent-1)]" : "text-[var(--accent-2)]"}>
              {toast.message}
            </span>
          </div>
        ) : null}

        <div className="grid gap-6">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Profile / General</div>
            <div className="mt-3 text-sm text-[var(--ink-1)]">Coming soon. Personal preferences and account settings.</div>
          </section>

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Data</div>
                <div className="mt-2 text-sm text-[var(--ink-1)]">
                  회사/집 환경에서 데이터를 옮길 때 사용
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                onClick={() => {
                  downloadLifnuxExport({ useBackup: true });
                  showToast({ type: "success", message: "Export downloaded." });
                }}
              >
                Export Lifnux Data
              </button>
              <button
                className="rounded-full border border-amber-400/50 px-4 py-2 text-xs text-amber-200"
                onClick={() => fileInputRef.current?.click()}
              >
                Import Lifnux Data
              </button>
            </div>
          </section>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              const payload = JSON.parse(text);
              if (!validateLifnuxExport(payload)) {
                showToast({ type: "error", message: "Invalid Lifnux export file." });
                return;
              }
              setPendingImport(payload);
              setConfirmOpen(true);
            } catch {
              showToast({ type: "error", message: "Failed to read import file." });
            } finally {
              event.target.value = "";
            }
          }}
        />
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Import Lifnux Data"
        description="기존 데이터가 모두 덮어써집니다. 계속하시겠습니까?"
        confirmLabel="Import"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingImport && validateLifnuxExport(pendingImport)) {
            importLifnuxExport(pendingImport);
            showToast({ type: "success", message: "Import complete. Please refresh the page." });
          } else {
            showToast({ type: "error", message: "Invalid import payload." });
          }
          setPendingImport(null);
          setConfirmOpen(false);
        }}
        onCancel={() => {
          setPendingImport(null);
          setConfirmOpen(false);
        }}
      />
    </main>
  );
}
