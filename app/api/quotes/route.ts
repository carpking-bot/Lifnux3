import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const baseUrl = process.env.QUOTE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const upstreamUrl = `${baseUrl}/quotes?symbols=${encodeURIComponent(symbols.join(","))}`;

  try {
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    if (!response.ok) {
      console.error("[QUOTE SERVICE ERROR]", response.status, response.statusText);
      return NextResponse.json({ quotes: [], error: "quote-service-error" });
    }
    const body = await response.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[QUOTE SERVICE UNAVAILABLE]", error);
    return NextResponse.json({ quotes: [], error: "quote-service-unavailable" });
  }
}
