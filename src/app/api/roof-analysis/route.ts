import { NextResponse } from "next/server";
import { analyzeRoofFromStaticMapDataUrl, buildOverlaySvg } from "@/lib/roof-analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

function toDataUrl(mimeType: string, bytes: ArrayBuffer): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (!lat || !lng) {
      return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
    }

    const staticMapUrl = new URL(
      `/api/static-map?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      req.url,
    ).toString();

    const staticMapRes = await fetch(staticMapUrl, { cache: "no-store" });
    if (!staticMapRes.ok) {
      return NextResponse.json({ error: "Failed to fetch static map image for analysis." }, { status: 502 });
    }

    const contentType = staticMapRes.headers.get("content-type") || "image/png";
    const bytes = await staticMapRes.arrayBuffer();
    const dataUrl = toDataUrl(contentType, bytes);

    const analysis = await analyzeRoofFromStaticMapDataUrl(dataUrl);
    const overlaySvg = buildOverlaySvg(analysis);

    return NextResponse.json({
      ...analysis,
      overlaySvg,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to analyze roof image.", details: error?.message ?? String(error) },
      { status: 500 },
    );
  }
}
