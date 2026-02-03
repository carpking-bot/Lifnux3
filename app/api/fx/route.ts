import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair") ?? "USD/KRW";
  const baseUrl = process.env.QUOTE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const upstreamUrl = `${baseUrl}/fx?pair=${encodeURIComponent(pair)}`;

  try {
    console.log("[API FX]", "quoteServiceUrl=", baseUrl, "url=", upstreamUrl);
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    console.log("[API FX]", "status=", response.status);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("[FX SERVICE ERROR]", response.status, response.statusText, body);
      return new NextResponse(body || JSON.stringify({ fx: null, error: "fx-service-error" }), {
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
    console.error("[FX SERVICE UNAVAILABLE]", error);
    return NextResponse.json({ fx: null, error: "fx-service-unavailable" });
  }
}
