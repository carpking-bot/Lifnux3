import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") ?? "").trim();
  const start = (searchParams.get("start") ?? "").trim();
  const end = (searchParams.get("end") ?? "").trim();

  if (!symbols) {
    return NextResponse.json({ series: [], start: null, end: null, asOf: null });
  }

  const baseUrl = process.env.QUOTE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const upstream = new URL(`${baseUrl}/history`);
  upstream.searchParams.set("symbols", symbols);
  if (start) upstream.searchParams.set("start", start);
  if (end) upstream.searchParams.set("end", end);

  try {
    const response = await fetch(upstream.toString(), { cache: "no-store" });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return new NextResponse(body || JSON.stringify({ series: [], error: "history-service-error" }), {
        status: response.status,
        headers: { "content-type": "application/json" }
      });
    }

    const body = await response.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[NEXT HISTORY UNAVAILABLE]", error);
    return NextResponse.json({ series: [], error: "history-service-unavailable" });
  }
}

