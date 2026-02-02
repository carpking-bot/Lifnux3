import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const baseUrl = process.env.QUOTE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const upstreamUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    if (!response.ok) {
      console.error("[QUOTE SERVICE SEARCH ERROR]", response.status, response.statusText);
      return NextResponse.json({ results: [], error: "quote-service-error" });
    }
    const body = await response.text();
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[QUOTE SERVICE SEARCH UNAVAILABLE]", error);
    return NextResponse.json({ results: [], error: "quote-service-unavailable" });
  }
}
