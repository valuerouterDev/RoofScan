"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";

type Segment = {
  segmentIndex: number;
  areaSqFt: number | null;
  pitchDegrees: number | null;
  pitchX12: string | null;
  azimuthDegrees: number | null;
};

type EstimateResponse = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  staticMapImageUrl?: string;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EstimateResponse | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!address.trim()) {
      setError("Address is required.");
      return;
    }

    setLoading(true);
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
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
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
        <button type="submit" disabled={loading}>{loading ? "Estimating..." : "Estimate Roof"}</button>
        {error && <div className="error">{error}</div>}
      </form>

      {result && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Estimate Result</h2>
          <div className="grid">
            <div className="kv"><b>Address</b>{result.formattedAddress}</div>
            <div className="kv"><b>Coordinates</b>{result.latitude}, {result.longitude}</div>
            <div className="kv"><b>Estimated Roof Size</b>{result.roofAreaSqFt.toLocaleString()} sq ft</div>
            <div className="kv"><b>Roof Area</b>{result.roofAreaMeters2} m²</div>
            <div className="kv"><b>Roofing Squares</b>{result.roofingSquares} squares</div>
            <div className="kv"><b>Average Pitch</b>{result.averagePitchDegrees != null ? `${result.averagePitchDegrees}°` : "Unavailable"}</div>
            <div className="kv"><b>Approximate Pitch</b>{result.pitchX12 ?? "Unavailable"}</div>
            <div className="kv"><b>Solar API Imagery Date</b>{result.imageryDate ?? "Unavailable"}</div>
            <div className="kv"><b>Flat projected area</b>{result.flatAreaSqFt != null ? `${result.flatAreaSqFt.toLocaleString()} sq ft` : "Unavailable"}</div>
            <div className="kv"><b>Roof segments</b>{result.segments.length}</div>
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

          {!!result.segments.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>Area sq ft</th>
                    <th>Pitch degrees</th>
                    <th>Pitch x:12</th>
                    <th>Azimuth</th>
                  </tr>
                </thead>
                <tbody>
                  {result.segments.map((s) => (
                    <tr key={s.segmentIndex}>
                      <td>{s.segmentIndex + 1}</td>
                      <td>{s.areaSqFt ?? "-"}</td>
                      <td>{s.pitchDegrees != null ? `${s.pitchDegrees}°` : "-"}</td>
                      <td>{s.pitchX12 ?? "-"}</td>
                      <td>{s.azimuthDegrees != null ? `${s.azimuthDegrees}°` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
