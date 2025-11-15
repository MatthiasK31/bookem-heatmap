# Nashville Book Distribution Map – Next.js (App Router)

This app has been converted from Vite to Next.js (App Router) to enable SSR/SSG, built‑in API routes, and easier backend integration.

## Getting Started

1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open http://localhost:3000

## Project Structure

- `app/` – App Router entrypoints
  - `app/page.tsx` dynamically loads the Leaflet map as a client component
  - `app/layout.tsx` provides the root layout and imports global styles
- `components/Map.tsx` – Leaflet map, markers, and canvas heatmap
- `app/globals.css` – Tailwind global styles
- `tailwind.config.js` – Tailwind content globs updated for Next.js
- `next.config.mjs` – Next.js configuration
- `tsconfig.json`, `next-env.d.ts` – TypeScript configuration for Next.js

The original Vite entry files (`index.html`, `src/index.tsx`) remain for reference but are no longer used by Next.js.

## Next Steps (Backend)

- Pick a backend: Firebase (fastest) or Supabase/PostGIS (best geospatial).
- I can scaffold `app/api/*` routes and connect to your chosen backend.

## Uploading Data (.xlsx or .csv)

- Option 1: Upload a single Excel workbook (.xlsx) with three sheets named exactly:
  - `Book Recipients` (columns like: `zipcode`, `# of books received`)
  - `RIF Volunteers` (columns like: `zipcode`, `# of volunteers`)
  - `RIF Schools` (columns like: `zipcode`, `# of schools`)
- Option 2: Upload up to three CSVs exported from those sheets. Name them clearly (e.g., `Book Recipients.csv`, `RIF Volunteers.csv`, `RIF Schools.csv`) or include distinct columns; the app will auto-detect based on headers or filename.

- The app parses the inputs client-side and updates:
  - Heatmap from Book Recipients, using a fixed 0.5 mile diameter per point.
  - Volunteer markers show the aggregated number per ZIP in the popup.
  - School pins: one pin per school with a placeholder label so you can rename later.

ZIP to lat/lng mapping comes from `data/zip-centroids.ts` (approximate for dev). If your sheet contains ZIPs not in that file, they will be listed in the header. Add missing ZIPs with accurate coordinates and refresh.
