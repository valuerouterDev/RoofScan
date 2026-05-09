# Roof Measure

Roof Size & Pitch Estimator web app based on Google Geocoding + Google Solar APIs.

## Features

- Address input
- Geocoding to lat/lng
- Solar `buildingInsights:findClosest` with `HIGH` then `MEDIUM` fallback
- Roof area output in m² and sq ft
- Roofing squares
- Representative pitch (area-weighted) in degrees and x:12
- Optional segment table
- Server-side API key protection

## API

`POST /api/roof-estimate`

Request:

```json
{ "address": "21106 Kenswick Meadows Ct, Humble, TX 77338" }
```

## Setup

Prerequisites for your Google Cloud key:
- Geocoding API enabled
- Solar API enabled
- Static Maps API enabled

1. Copy env file:

```bash
cp .env.example .env.local
```

2. Set your key:

```text
GOOGLE_MAPS_API_KEY=your_google_api_key
```

3. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- This app is an estimator.
- It does not provide ridge/hip/valley/eave/rake/gutter line-item measurements.
