import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Summary = {
  hasExport: boolean;
  filename: string | null;
  modifiedAt: string | null;
  size: number | null;
};

const EXPORTS_DIR = path.join(process.cwd(), "exports");

async function listLatestExport() {
  const entries = await fs.readdir(EXPORTS_DIR, { withFileTypes: true }).catch(() => []);
  let latest: { filename: string; path: string; mtimeMs: number; size: number } | null = null;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(EXPORTS_DIR, entry.name);
    try {
      const stat = await fs.stat(filePath);
      const current = { filename: entry.name, path: filePath, mtimeMs: stat.mtimeMs, size: stat.size };
      if (!latest || current.mtimeMs > latest.mtimeMs) {
        latest = current;
      }
    } catch {
      continue;
    }
  }

  if (!latest) {
    return { hasExport: false, filename: null, modifiedAt: null, size: null } as Summary;
  }

  return {
    hasExport: true,
    filename: latest.filename,
    modifiedAt: new Date(latest.mtimeMs).toISOString(),
    size: latest.size
  } as Summary;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includePayload = searchParams.get("includePayload") === "true" || searchParams.get("includePayload") === "1";
  const summary = await listLatestExport();

  if (!summary.hasExport) {
    return NextResponse.json(summary);
  }

  if (!includePayload) {
    return NextResponse.json(summary);
  }

  const latestPath = path.join(EXPORTS_DIR, summary.filename as string);
  const raw = await fs.readFile(latestPath, "utf8");

  try {
    return NextResponse.json({
      ...summary,
      payload: JSON.parse(raw)
    });
  } catch {
    return NextResponse.json({
      ...summary,
      payload: null
    });
  }
}
