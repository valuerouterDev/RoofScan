import { NextResponse } from "next/server";

const STATIC_MAPS_URL = "https://maps.googleapis.com/maps/api/staticmap";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY on server." }, { status: 500 });
  }

  const mapUrl = new URL(STATIC_MAPS_URL);
  mapUrl.searchParams.set("center", `${lat},${lng}`);
  mapUrl.searchParams.set("zoom", "21");
  mapUrl.searchParams.set("size", "640x640");
  mapUrl.searchParams.set("scale", "2");
  mapUrl.searchParams.set("maptype", "satellite");
  mapUrl.searchParams.set("markers", `color:red|${lat},${lng}`);
  mapUrl.searchParams.set("key", apiKey);

  const res = await fetch(mapUrl.toString(), { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch static map image." }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
