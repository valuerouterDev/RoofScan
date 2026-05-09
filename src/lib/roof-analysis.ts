const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type RoofLineItem = {
  item: string;
  pixels: number;
  feet: number;
};

export type RoofAnalysisResult = {
  summary: string;
  feetPerPixel: number;
  roofOutlinePoints: Array<{ x: number; y: number }>;
  ridgeLines: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
  measurements: RoofLineItem[];
};

const USER_PROMPT = `Please try to understand the direction of the sun and then draw the roof outline and all the ridges of the house in the center of the image. Don't change the original image scale. The image has scale as feetPerPixel ≈ 0.212 ft/pixel. Please calculate the pixels and feet of the outline and other roofing measurement line items such as: ridge, hip, valley, rake, eave, gutter, flashing, step flashing.`;

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} on server.`);
  return v;
}

function extractText(output: any): string {
  const parts: string[] = [];
  for (const item of output?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/(\{[\s\S]*\})/);
    if (!match) throw new Error("Model did not return parseable JSON.");
    return JSON.parse(match[1]);
  }
}

function validateResult(data: any): RoofAnalysisResult {
  if (!data || typeof data !== "object") throw new Error("Invalid roof analysis payload.");
  return {
    summary: typeof data.summary === "string" ? data.summary : "Roof analysis completed.",
    feetPerPixel: typeof data.feetPerPixel === "number" ? data.feetPerPixel : 0.212,
    roofOutlinePoints: Array.isArray(data.roofOutlinePoints) ? data.roofOutlinePoints : [],
    ridgeLines: Array.isArray(data.ridgeLines) ? data.ridgeLines : [],
    measurements: Array.isArray(data.measurements) ? data.measurements : [],
  };
}

export function buildOverlaySvg(analysis: RoofAnalysisResult, width = 640, height = 640): string {
  const outline = analysis.roofOutlinePoints
    .map((p) => `${Number(p.x).toFixed(1)},${Number(p.y).toFixed(1)}`)
    .join(" ");

  const ridgeLines = analysis.ridgeLines
    .map(
      (l) =>
        `<line x1="${Number(l.from.x).toFixed(1)}" y1="${Number(l.from.y).toFixed(1)}" x2="${Number(l.to.x).toFixed(1)}" y2="${Number(l.to.y).toFixed(1)}" stroke="#00e5ff" stroke-width="2" />`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <polygon points="${outline}" fill="rgba(255, 255, 0, 0.18)" stroke="#ffcc00" stroke-width="2" />
  ${ridgeLines}
</svg>`;
}

export async function analyzeRoofFromStaticMapDataUrl(imageDataUrl: string): Promise<RoofAnalysisResult> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_ROOF_MODEL || "gpt-5";
  const timeoutMs = Number(process.env.OPENAI_ANALYSIS_TIMEOUT_MS || 45000);

  const schemaHint = {
    summary: "string",
    feetPerPixel: 0.212,
    roofOutlinePoints: [{ x: 0, y: 0 }],
    ridgeLines: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    measurements: [{ item: "ridge", pixels: 0, feet: 0 }],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a roofing measurement analyst. Return only valid JSON with pixel-space coordinates referenced to the original 640x640 image. Keep scale unchanged.",
              },
            ],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: USER_PROMPT },
              { type: "input_image", image_url: imageDataUrl },
              { type: "input_text", text: `Return JSON exactly with this shape: ${JSON.stringify(schemaHint)}` },
            ],
          },
        ],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI analysis timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`OpenAI analysis failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const text = extractText(json);
  if (!text) throw new Error("OpenAI returned empty analysis output.");
  return validateResult(extractJson(text));
}
