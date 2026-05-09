import { NextResponse } from "next/server";
import {
  calculateSlopedAreaFromGroundArea,
  formatImageryDate,
  formatPitchX12,
  meters2ToSqFt,
  sqFtToRoofingSquares,
  weightedAveragePitch,
} from "@/lib/roof";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const SOLAR_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest";

function mapGeocodeError(status: string) {
  switch (status) {
    case "ZERO_RESULTS":
      return { code: 404, message: "Address not found." };
    case "REQUEST_DENIED":
      return { code: 403, message: "API key issue or Geocoding API not enabled." };
    case "OVER_QUERY_LIMIT":
      return { code: 429, message: "API quota exceeded." };
    case "INVALID_REQUEST":
      return { code: 400, message: "Invalid address request." };
    default:
      return { code: 502, message: `Geocoding failed (${status}).` };
  }
}

async function fetchSolar(apiKey: string, lat: number, lng: number, requiredQuality: "HIGH" | "MEDIUM") {
  const url = new URL(SOLAR_URL);
  url.searchParams.set("location.latitude", String(lat));
  url.searchParams.set("location.longitude", String(lng));
  url.searchParams.set("requiredQuality", requiredQuality);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address is required." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY on server." }, { status: 500 });
    }

    const geocodeUrl = new URL(GEOCODE_URL);
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("key", apiKey);

    const geocodeRes = await fetch(geocodeUrl, { cache: "no-store" });
    const geocodeData = await geocodeRes.json();

    if (geocodeData.status !== "OK" || !geocodeData.results?.length) {
      const mapped = mapGeocodeError(geocodeData.status);
      return NextResponse.json({ error: mapped.message, details: geocodeData.status }, { status: mapped.code });
    }

    const geocodeResult = geocodeData.results[0];
    const { lat, lng } = geocodeResult.geometry.location;

    let solar = await fetchSolar(apiKey, lat, lng, "HIGH");
    if (!solar.ok) {
      solar = await fetchSolar(apiKey, lat, lng, "MEDIUM");
    }
    if (!solar.ok || !solar.data?.solarPotential) {
      return NextResponse.json(
        { error: "Solar roof data not available for this address.", details: solar.data },
        { status: 404 },
      );
    }

    const solarPotential = solar.data.solarPotential;
    const wholeRoofStats = solarPotential.wholeRoofStats ?? {};
    const segments = solarPotential.roofSegmentStats ?? [];

    let roofAreaMeters2: number | null =
      typeof wholeRoofStats.areaMeters2 === "number" ? wholeRoofStats.areaMeters2 : null;

    const averagePitchDegreesRaw = weightedAveragePitch(segments);

    if (roofAreaMeters2 == null) {
      if (segments.length) {
        roofAreaMeters2 = segments.reduce((sum: number, s: any) => {
          const ground = s?.stats?.groundAreaMeters2;
          const pitch = s?.pitchDegrees;
          if (typeof ground === "number" && typeof pitch === "number") {
            return sum + calculateSlopedAreaFromGroundArea(ground, pitch);
          }
          return sum;
        }, 0);
      } else if (
        typeof wholeRoofStats.groundAreaMeters2 === "number" &&
        typeof averagePitchDegreesRaw === "number"
      ) {
        roofAreaMeters2 = calculateSlopedAreaFromGroundArea(
          wholeRoofStats.groundAreaMeters2,
          averagePitchDegreesRaw,
        );
      }
    }

    if (roofAreaMeters2 == null) {
      return NextResponse.json(
        { error: "Unable to calculate roof area from Solar API response." },
        { status: 422 },
      );
    }

    const roofAreaSqFt = meters2ToSqFt(roofAreaMeters2);
    const flatAreaMeters2 =
      typeof wholeRoofStats.groundAreaMeters2 === "number" ? wholeRoofStats.groundAreaMeters2 : null;
    const flatAreaSqFt = flatAreaMeters2 != null ? meters2ToSqFt(flatAreaMeters2) : null;

    const averagePitchDegrees =
      typeof averagePitchDegreesRaw === "number" ? Number(averagePitchDegreesRaw.toFixed(1)) : null;
    const pitchX12 = averagePitchDegrees != null ? formatPitchX12(averagePitchDegrees) : null;

    return NextResponse.json({
      formattedAddress: geocodeResult.formatted_address,
      latitude: lat,
      longitude: lng,
      staticMapImageUrl: `/api/static-map?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`, 
      roofAreaMeters2: Number(roofAreaMeters2.toFixed(2)),
      roofAreaSqFt: Math.round(roofAreaSqFt),
      roofingSquares: Number(sqFtToRoofingSquares(roofAreaSqFt).toFixed(1)),
      flatAreaMeters2: flatAreaMeters2 != null ? Number(flatAreaMeters2.toFixed(2)) : null,
      flatAreaSqFt: flatAreaSqFt != null ? Math.round(flatAreaSqFt) : null,
      averagePitchDegrees,
      pitchX12,
      imageryDate: formatImageryDate(solar.data.imageryDate),
      segments: segments.map((s: any, index: number) => ({
        segmentIndex: index,
        areaMeters2: s?.stats?.areaMeters2 ?? null,
        areaSqFt:
          typeof s?.stats?.areaMeters2 === "number" ? Math.round(meters2ToSqFt(s.stats.areaMeters2)) : null,
        groundAreaMeters2: s?.stats?.groundAreaMeters2 ?? null,
        pitchDegrees: typeof s?.pitchDegrees === "number" ? Number(s.pitchDegrees.toFixed(1)) : null,
        pitchX12: typeof s?.pitchDegrees === "number" ? formatPitchX12(s.pitchDegrees, "decimal") : null,
        azimuthDegrees: typeof s?.azimuthDegrees === "number" ? Number(s.azimuthDegrees.toFixed(1)) : null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Unexpected server error.", details: error?.message ?? String(error) },
      { status: 500 },
    );
  }
}
