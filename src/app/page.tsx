"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";

type Segment = {
  segmentIndex: number;
  areaSqFt: number | null;
  pitchDegrees: number | null;
  pitchX12: string | null;
  azimuthDegrees: number | null;
};

type RoofAnalysis = {
  summary: string;
  feetPerPixel: number;
  roofOutlinePoints: Array<{ x: number; y: number }>;
  ridgeLines: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
  measurements: Array<{ item: string; pixels: number; feet: number }>;
  overlaySvg: string;
};

const OPENAI_LINE_ITEMS = [
  "ridge",
  "hip",
  "valley",
  "rake",
  "eave",
  "gutter",
  "flashing",
  "step flashing",
] as const;

type EstimateResponse = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  staticMapImageUrl?: string;
  roofAnalysisUrl?: string;
  roofAreaMeters2: number;
  roofAreaSqFt: number;
  roofingSquares: number;
  flatAreaMeters2: number | null;
  flatAreaSqFt: number | null;
  averagePitchDegrees: number | null;
  pitchX12: string | null;
  imageryDate: string | null;
  segments: Segment[];
};

export default function HomePage() {
  const [address, setAddress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [analysis, setAnalysis] = useState<RoofAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setResult(null);
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setLoadingEstimate(true);
    setLoadingAnalysis(false);
    try {
      const res = await fetch("/api/roof-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed.");
        return;
      }

      setResult(data);
      setLoadingEstimate(false);

      if (data.roofAnalysisUrl) {
        setLoadingAnalysis(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 70000);
        try {
          const analysisRes = await fetch(data.roofAnalysisUrl, { cache: "no-store", signal: controller.signal });
          const analysisData = await analysisRes.json();
          if (!analysisRes.ok) {
            setAnalysisError(analysisData.error || "Roof analysis failed.");
          } else {
            setAnalysis(analysisData);
          }
        } catch (err: any) {
          if (err?.name === "AbortError") {
            setAnalysisError("OpenAI analysis timed out. Please retry.");
          } else {
            setAnalysisError("Network error while analyzing roof image.");
          }
        } finally {
          clearTimeout(timeoutId);
          setLoadingAnalysis(false);
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingEstimate(false);
    }
  }

  async function handlePasteShortcut(e: KeyboardEvent<HTMLInputElement>) {
    const isPasteShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v";
    if (!isPasteShortcut) return;

    // Fallback for environments where default Ctrl/Cmd+V doesn't populate controlled input.
    e.preventDefault();
    try {
      const text = await navigator.clipboard.readText();
      const input = inputRef.current;
      if (!input) {
        setAddress((prev) => `${prev}${text}`);
        return;
      }

      const start = input.selectionStart ?? address.length;
      const end = input.selectionEnd ?? start;
      const next = `${address.slice(0, start)}${text}${address.slice(end)}`;
      setAddress(next);

      requestAnimationFrame(() => {
        const pos = start + text.length;
        input.setSelectionRange(pos, pos);
      });
    } catch {
      // If clipboard API is blocked, let user use context-menu paste.
    }
  }

  const openAiMeasurements = OPENAI_LINE_ITEMS.map((name) => {
    const found = analysis?.measurements.find((m) => m.item.toLowerCase().trim() === name);
    return {
      item: name,
      pixels: found?.pixels ?? 0,
      feet: found?.feet ?? 0,
    };
  });

  return (
    <main>
      <h1>Roof Measure</h1>
      <p className="muted">Estimate roof size and pitch from an address using Google Geocoding and Google Solar APIs.</p>

      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="address"><b>House address</b></label>
        <input
          ref={inputRef}
          id="address"
          placeholder="21106 Kenswick Meadows Ct, Humble, TX 77338"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={handlePasteShortcut}
        />
        <button type="submit" disabled={loadingEstimate || loadingAnalysis}>
          {loadingEstimate ? "Estimating..." : loadingAnalysis ? "Waiting for further AI analysis..." : "Estimate Roof"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>

      {result && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Estimate Result</h2>
          <div className="grid">
            <div className="kv"><b>Address</b>{result.formattedAddress}</div>
            <div className="kv"><b>Coordinates</b>{result.latitude}, {result.longitude}</div>
            <div className="kv" style={{ background: "#fff7d6", borderRadius: 8, padding: "8px 10px" }}><b>Estimated Roof Size</b>{result.roofAreaSqFt.toLocaleString()} sq ft</div>
            <div className="kv"><b>Roof Area</b>{result.roofAreaMeters2} m²</div>
            <div className="kv"><b>Roofing Squares</b>{result.roofingSquares} squares</div>
            <div className="kv" style={{ background: "#fff7d6", borderRadius: 8, padding: "8px 10px" }}><b>Average Pitch</b>{result.averagePitchDegrees != null ? `${result.averagePitchDegrees}°` : "Unavailable"}</div>
            <div className="kv" style={{ background: "#fff7d6", borderRadius: 8, padding: "8px 10px" }}><b>Approximate Pitch</b>{result.pitchX12 ?? "Unavailable"}</div>
            <div className="kv"><b>Solar API Imagery Date</b>{result.imageryDate ?? "Unavailable"}</div>
            <div className="kv"><b>Flat projected area</b>{result.flatAreaSqFt != null ? `${result.flatAreaSqFt.toLocaleString()} sq ft` : "Unavailable"}</div>
          </div>

          {result.staticMapImageUrl && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 8 }}>Target House (Google Static Map)</h3>
              <img
                src={result.staticMapImageUrl}
                alt="Target house satellite view"
                style={{ width: "100%", maxWidth: 720, borderRadius: 10, border: "1px solid #e2e8f0" }}
              />
            </div>
          )}

          {loadingAnalysis && (
            <p className="muted" style={{ marginTop: 10 }}>Google result is ready. Waiting for further AI analysis...</p>
          )}

        </section>
      )}

      {(analysis || analysisError) && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>OpenAI Roof Analysis</h2>

          {analysisError && <div className="error">Roof analysis failed: {analysisError}</div>}

          {analysis && (
            <>
              {result?.staticMapImageUrl && (
                <div style={{ marginTop: 12 }}>
                  <h3 style={{ marginBottom: 8 }}>Roof Overlay (OpenAI Vision)</h3>
                  <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
                    <img
                      src={result.staticMapImageUrl}
                      alt="Target house satellite view"
                      style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", display: "block" }}
                    />
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(analysis.overlaySvg)}`}
                      alt="Roof outline and ridge overlay"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                    />
                  </div>
                </div>
              )}

              <p className="muted" style={{ marginTop: 10 }}>{analysis.summary}</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Pixels</th>
                      <th>Feet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openAiMeasurements.map((m) => (
                      <tr key={m.item}>
                        <td>{m.item}</td>
                        <td>{m.pixels}</td>
                        <td>{m.feet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
