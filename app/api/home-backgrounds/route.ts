import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const BACKGROUND_DIR = path.join(process.cwd(), "public", "home-backgrounds");

export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await fs.readdir(BACKGROUND_DIR, { withFileTypes: true });
    const pngFiles = entries
      .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "ko"));

    return NextResponse.json({
      backgrounds: pngFiles.map((fileName) => ({
        id: fileName,
        label: fileName.replace(/\.png$/i, ""),
        src: `/home-backgrounds/${fileName}`
      }))
    });
  } catch {
    return NextResponse.json({ backgrounds: [] });
  }
}
