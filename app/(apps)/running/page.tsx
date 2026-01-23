import Link from "next/link";

export default function RunningPage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-5xl">RUNNING</h1>
        <Link
          className="inline-flex items-center justify-center rounded-full border border-white/10 px-6 py-3 text-sm text-[var(--ink-1)]"
          href="/"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
