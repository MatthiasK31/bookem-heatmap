"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import readXlsxFile from 'read-excel-file';
import Papa from 'papaparse';
import { zipCentroids } from '@/data/zip-centroids';

// Build an object with a null prototype to avoid prototype pollution from keys like "__proto__"
function fromEntriesSafe(entries: [string, unknown][]) {
  const obj: Record<string, unknown> = Object.create(null);
  for (const [k, v] of entries) {
    (obj as any)[k] = v;
  }
  return obj;
}

// Nashville coordinates
const NASHVILLE_CENTER: [number, number] = [36.1627, -86.7816];

type HeatPoint = { lat: number; lng: number; count: number };
type CountByZip = Record<string, number>;

type VolunteerMarker = { lat: number; lng: number; count: number };

type SchoolPin = { lat: number; lng: number; label: string };

const MARKER_COLORS = {
  volunteers: '#7C3AED', // purple
  schools: '#166534', // dark green
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((c) => `${c}${c}`).join('') : normalized;
  const value = parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const HEATMAP_GRADIENT = [
  { stop: 0.0, color: hexToRgb('#A8E6A3') }, // light green
  { stop: 0.5, color: hexToRgb('#F5E66A') }, // yellow
  { stop: 1.0, color: hexToRgb('#E85C4A') }, // red
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgbToString = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;

const darkenRgb = (rgb: string, factor: number) => {
  const [r, g, b] = rgb.split(',').map((value) => Number(value.trim()));
  return rgbToString({
    r: Math.round(r * factor),
    g: Math.round(g * factor),
    b: Math.round(b * factor),
  });
};

const getHeatmapRgb = (value: number) => {
  const t = clamp(value, 0, 1);
  for (let i = 0; i < HEATMAP_GRADIENT.length - 1; i++) {
    const current = HEATMAP_GRADIENT[i];
    const next = HEATMAP_GRADIENT[i + 1];
    if (t <= next.stop) {
      const local = (t - current.stop) / (next.stop - current.stop || 1);
      return rgbToString({
        r: lerp(current.color.r, next.color.r, local),
        g: lerp(current.color.g, next.color.g, local),
        b: lerp(current.color.b, next.color.b, local),
      });
    }
  }
  return rgbToString(HEATMAP_GRADIENT[HEATMAP_GRADIENT.length - 1].color);
};

const legendHeatStyle = (value: number): React.CSSProperties => {
  const edgeRgb = getHeatmapRgb(value);
  const alpha = Math.min(1, 0.55 + value * 0.65);
  const midAlpha = Math.max(0.3, alpha * 0.75);
  return {
    backgroundImage: `radial-gradient(circle, rgba(${edgeRgb}, ${alpha}) 0%, rgba(${edgeRgb}, ${midAlpha}) 55%, rgba(${edgeRgb}, 0) 100%)`,
    border: `1px solid rgba(${darkenRgb(edgeRgb, 0.6)}, 0.95)`,
  };
};

// Custom marker icons using divIcon (no external images)
const createCustomIcon = (color: string, type: 'user' | 'school') =>
  L.divIcon({
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${
          type === 'user'
            ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
            : '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'
        }
      </svg>
    </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

const volunteerIcon = createCustomIcon(MARKER_COLORS.volunteers, 'user');
const schoolIcon = createCustomIcon(MARKER_COLORS.schools, 'school');

// Helpers
const metersPerPixel = (lat: number, zoom: number) => 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
const milesToMeters = (miles: number) => miles * 1609.344;
const HEAT_DIAMETER_MILES = 0.5; // as requested
const HEAT_RADIUS_METERS = milesToMeters(HEAT_DIAMETER_MILES) / 2; // 0.25-mile radius
const HEAT_RADIUS_MIN_MULT = 1.2;
const HEAT_RADIUS_MAX_MULT = 3.0;

// Convert ZIP to coordinates using local centroids map
function zipToLatLng(zip: string | number): { lat: number; lng: number } | undefined {
  const z = String(zip).trim();
  const rec = (zipCentroids as Record<string, { lat: number; lng: number }>)[z];
  if (!rec) return undefined;
  return { lat: rec.lat, lng: rec.lng };
}

// Geocode address to coordinates using Nominatim (OpenStreetMap)
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null;
  
  try {
    // Use address as-is since it's already in full format (e.g., "4247 Cato Rd, Nashville, TN 37218")
    const trimmedAddress = address.trim();
    const query = encodeURIComponent(trimmedAddress);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BookEm Heatmap App' // Required by Nominatim
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function parseCount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return cleaned ? Number(cleaned[0]) : 0;
  }
  return Number(value) || 0;
}

function normalizeZip(value: unknown): string {
  if (value == null) return '';
  
  // Convert to string
  let str = String(value);
  
  // Remove trailing ".0+" pattern (e.g., "37218.0" -> "37218", "37218.000" -> "37218")
  str = str.replace(/\.0+$/, '');
  
  // Extract only digits
  const digits = str.replace(/\D/g, '');
  
  // If no digits found, return empty string
  if (digits.length === 0) return '';
  
  // Pad with zeros to make exactly 5 digits (zfill(5))
  // If longer than 5, take first 5 digits
  return digits.slice(0, 5).padStart(5, '0');
}

// Custom heatmap overlay rendered on a canvas and applied as an imageOverlay
function HeatmapOverlay({ data, show }: { data: HeatPoint[]; show: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!show) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const overlay = L.imageOverlay('', map.getBounds(), { opacity: 0.6, interactive: false }).addTo(map);

    const updateHeatmap = () => {
      const bounds = map.getBounds();
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const counts = data.map((p) => p.count);
      const maxCount = Math.max(1, ...counts);
      const minCount = counts.length ? Math.min(...counts) : 0;
      const range = Math.max(0, maxCount - minCount);
      const logDenom = range > 0 ? Math.log(range + 1) : 0;

      data.forEach((point) => {
        if (point.count <= 0) return;
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const logScaled = logDenom > 0 ? Math.log(point.count - minCount + 1) / logDenom : 1;
        const colorIntensity = Math.pow(logScaled, 1.25);
        const radiusMeters =
          HEAT_RADIUS_METERS *
          (HEAT_RADIUS_MIN_MULT + (HEAT_RADIUS_MAX_MULT - HEAT_RADIUS_MIN_MULT) * logScaled);
        // Convert radius in meters to pixels at current zoom/latitude
        const pxRadius = radiusMeters / metersPerPixel(point.lat, map.getZoom());
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, pxRadius);

        const edgeRgb = getHeatmapRgb(colorIntensity);
        const alpha = Math.min(1, 0.55 + colorIntensity * 0.65);

        gradient.addColorStop(0, `rgba(${edgeRgb}, ${alpha})`);
        gradient.addColorStop(0.55, `rgba(${edgeRgb}, ${Math.max(0.3, alpha * 0.75)})`);
        gradient.addColorStop(1, `rgba(${edgeRgb}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pxRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${darkenRgb(edgeRgb, 0.6)}, 0.95)`;
        ctx.lineWidth = Math.max(2.5, pxRadius * 0.1);
        ctx.stroke();
      });

      overlay.setUrl(canvas.toDataURL());
      overlay.setBounds(bounds);
    };

    updateHeatmap();
    map.on('moveend', updateHeatmap);
    map.on('zoomend', updateHeatmap);

    return () => {
      map.off('moveend', updateHeatmap);
      map.off('zoomend', updateHeatmap);
      map.removeLayer(overlay);
    };
  }, [map, data, show]);

  return null;
}

function Legend() {
  return (
    <div className="absolute bottom-6 right-6 z-[1000] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Legend
      </div>

      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Book Heatmap
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={legendHeatStyle(0.2)} />
          <span>Low Intensity</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={legendHeatStyle(0.6)} />
          <span>Medium Intensity</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={legendHeatStyle(0.9)} />
          <span>High Intensity</span>
        </div>

        <div className="my-2 h-px w-full bg-slate-200" />

        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: MARKER_COLORS.volunteers }}
          />
          <span>Volunteers</span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded-sm border-2 border-white shadow-sm"
            style={{ backgroundColor: MARKER_COLORS.schools }}
          />
          <span>Schools</span>
        </div>
      </div>
    </div>
  );
}



function TogglePill({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600">
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span>{label}</span>
    </label>
  );
}

function UploadButton({ 
  label, 
  htmlFor, 
  uploadedFileName,
  isProcessing
}: { 
  label: string; 
  htmlFor: string; 
  uploadedFileName?: string | null;
  isProcessing?: boolean;
}) {
  const isUploaded = !!uploadedFileName;
  
  // Truncate filename if too long
  const displayText = isProcessing 
    ? 'Processing...' 
    : isUploaded 
    ? (uploadedFileName && uploadedFileName.length > 20 
      ? uploadedFileName.substring(0, 17) + '...' 
      : uploadedFileName || label)
    : label;
  
  return (
    <label
      htmlFor={htmlFor}
      className={`flex min-w-[120px] max-w-[180px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm transition-colors ${
        isProcessing
          ? 'border-blue-300 bg-blue-50 text-blue-700'
          : isUploaded
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-dashed border-slate-300 bg-slate-50 text-slate-700'
      }`}
      title={isUploaded && uploadedFileName ? uploadedFileName : undefined}
    >
      {isProcessing ? (
        <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : isUploaded ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 13h6" />
          <path d="M12 10v6" />
          <path d="M6 20h12a2 2 0 0 0 2-2V8l-6-4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
        </svg>
      )}
      <span className="truncate">{displayText}</span>
    </label>
  );
}

export default function Map() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showVolunteers, setShowVolunteers] = useState(true);
  const [showSchools, setShowSchools] = useState(true);
  const [heatData, setHeatData] = useState<HeatPoint[]>([]);
  const [volunteerMarkers, setVolunteerMarkers] = useState<VolunteerMarker[]>([]);
  const [schoolPins, setSchoolPins] = useState<SchoolPin[]>([]);
  const [unknownZips, setUnknownZips] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{
    bookData: string | null;
    volunteers: string | null;
    schools: string | null;
  }>({
    bookData: null,
    volunteers: null,
    schools: null,
  });
  const [isProcessingSchools, setIsProcessingSchools] = useState(false);
  const [isZipWarningExpanded, setIsZipWarningExpanded] = useState(false);

  const jitter = (lat: number, lng: number, meters: number) => {
    const dx = (Math.random() - 0.5) * 2 * meters; // east-west in meters
    const dy = (Math.random() - 0.5) * 2 * meters; // north-south in meters
    const dLat = (dy / 111320); // approx meters per degree latitude
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lng: lng + dLng };
  };

  const inferKey = (obj: Record<string, unknown>, candidates: string[]) =>
    Object.keys(obj).find((k) => candidates.includes(k.trim().toLowerCase()));

  // Parse a 2D rows array from read-excel-file into objects using the first row as headers
  const rowsToObjects = (rows: any[][]): Record<string, unknown>[] => {
    if (!rows.length) return [];
    const headers = rows[0].map((h: any) => String(h ?? '').trim().toLowerCase());
    return rows.slice(1).map((r) => {
      const obj: Record<string, unknown> = Object.create(null);
      headers.forEach((h: string, i: number) => {
        obj[h] = r[i] ?? null;
      });
      return obj;
    });
  };

  const processParsed = (
    recipients: Record<string, unknown>[],
    volunteers: Record<string, unknown>[],
    schools: Record<string, unknown>[]
  ) => {
    const missing: Set<string> = new Set();

    // Recipients → heat points aggregated by ZIP
    if (recipients.length) {
      const sample = recipients.find((r) => r && Object.keys(r).length > 0) || recipients[0];
      const zipKey = inferKey(sample, ['zip', 'zipcode', 'postal', 'postal code', 'zctas']);
      const booksKey = inferKey(sample, ['# of books received', 'books', 'count', 'total books', 'book count']);

      const byZip: CountByZip = {};
      recipients.forEach((r) => {
        const z = normalizeZip(r[zipKey!]);
        const cRaw = booksKey ? (r as any)[booksKey] : 1;
        const c = parseCount(cRaw);
        if (!z) return;
        byZip[z] = (byZip[z] || 0) + c;
      });

      const points: HeatPoint[] = [];
      Object.entries(byZip).forEach(([zip, count]) => {
        const pos = zipToLatLng(zip);
        if (!pos) { missing.add(zip); return; }
        points.push({ lat: pos.lat, lng: pos.lng, count });
      });
      setHeatData(points);
    } else {
      setHeatData([]);
    }

    // Volunteers → one marker per ZIP with aggregated volunteer count
    if (volunteers.length) {
      const sample = volunteers.find((r) => r && Object.keys(r).length > 0) || volunteers[0];
      const zipKey = inferKey(sample, ['zip', 'zipcode', 'postal', 'postal code']);
      const countKey = inferKey(sample, ['# of volunteers', 'volunteers', 'count']);

      const byZip: CountByZip = {};
      volunteers.forEach((r) => {
        const z = normalizeZip(r[zipKey!]);
        const cRaw = countKey ? (r as any)[countKey] : 1;
        const c = parseCount(cRaw);
        if (!z) return;
        byZip[z] = (byZip[z] || 0) + c;
      });

      const markers: VolunteerMarker[] = [];
      Object.entries(byZip).forEach(([zip, count]) => {
        const pos = zipToLatLng(zip);
        if (!pos) { missing.add(zip); return; }
        markers.push({ lat: pos.lat, lng: pos.lng, count });
      });
      setVolunteerMarkers(markers);
    } else {
      setVolunteerMarkers([]);
    }

    // Schools → use address-based geocoding (processed separately)
    if (schools.length) {
      processSchools(schools).catch((err) => {
        console.error('Error processing schools:', err);
      });
    } else {
      setSchoolPins([]);
    }

    setUnknownZips(Array.from(missing.values()).sort());
  };

  async function handleWorkbook(file: File) {
    // Read the three sheets
    const recipientsRows = await readXlsxFile(file, { sheet: 'Book Recipients' }).catch(() => []);
    const volunteersRows = await readXlsxFile(file, { sheet: 'RIF Volunteers' }).catch(() => []);
    const schoolsRows = await readXlsxFile(file, { sheet: 'RIF Schools' }).catch(() => []);

    const recipients = rowsToObjects(recipientsRows as any[][]);
    const volunteers = rowsToObjects(volunteersRows as any[][]);
    const schools = rowsToObjects(schoolsRows as any[][]);

    processParsed(recipients, volunteers, schools);
  }

  const parseCsv = async (file: File): Promise<Record<string, unknown>[]> => {
    const text = await file.text();
    const result = Papa.parse<Record<string, string | number | null>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    return (result.data || []) as Record<string, unknown>[];
  };

  const detectType = (rows: Record<string, unknown>[]): 'recipients' | 'volunteers' | 'schools' | null => {
    if (!rows.length) return null;
    const sample = rows.find((r) => r && Object.keys(r).length > 0) || rows[0];
    const hasBooks = !!inferKey(sample, ['# of books received', 'books', 'count', 'total books', 'book count']);
    const hasVols = !!inferKey(sample, ['# of volunteers', 'volunteers', 'count']);
    const hasSchools = !!inferKey(sample, ['# of schools', 'schools', 'count']);
    if (hasBooks && !hasVols && !hasSchools) return 'recipients';
    if (hasVols && !hasBooks && !hasSchools) return 'volunteers';
    if (hasSchools && !hasBooks && !hasVols) return 'schools';
    return null;
  };

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    const xlsx = files.find((f) => f.name.toLowerCase().endsWith('.xlsx'));
    if (xlsx) {
      await handleWorkbook(xlsx);
      return;
    }

    const csvs = files.filter((f) => f.name.toLowerCase().endsWith('.csv'));
    if (!csvs.length) {
      alert('Please choose an .xlsx workbook or .csv files.');
      return;
    }

    let recipients: Record<string, unknown>[] = [];
    let volunteers: Record<string, unknown>[] = [];
    let schools: Record<string, unknown>[] = [];

    for (const f of csvs) {
      const rows = await parseCsv(f);
      let type = detectType(rows);
      const name = f.name.toLowerCase();
      if (!type) {
        if (name.includes('recipient') || name.includes('book')) type = 'recipients';
        else if (name.includes('volunteer')) type = 'volunteers';
        else if (name.includes('school')) type = 'schools';
      }
      if (type === 'recipients') recipients = rows;
      else if (type === 'volunteers') volunteers = rows;
      else if (type === 'schools') schools = rows;
    }

    processParsed(recipients, volunteers, schools);
  }

  // Separate handlers for each category
  const processBookData = (recipients: Record<string, unknown>[]) => {
    if (!recipients.length) return;
    const missing: Set<string> = new Set();
    const sample = recipients.find((r) => r && Object.keys(r).length > 0) || recipients[0];
    const zipKey = inferKey(sample, ['zip', 'zipcode', 'postal', 'postal code', 'zctas']);
    const booksKey = inferKey(sample, ['# of books received', 'books', 'count', 'total books', 'book count']);

    const byZip: CountByZip = {};
    recipients.forEach((r) => {
      const z = normalizeZip(r[zipKey!]);
      const cRaw = booksKey ? (r as any)[booksKey] : 1;
      const c = parseCount(cRaw);
      if (!z) return;
      byZip[z] = (byZip[z] || 0) + c;
    });

    const points: HeatPoint[] = [];
    Object.entries(byZip).forEach(([zip, count]) => {
      const pos = zipToLatLng(zip);
      if (!pos) { missing.add(zip); return; }
      points.push({ lat: pos.lat, lng: pos.lng, count });
    });
    setHeatData(points);
    // Update unknown zips, but merge with existing
    setUnknownZips(prev => Array.from(new Set([...prev, ...Array.from(missing.values())])).sort());
  };

  const processVolunteers = (volunteers: Record<string, unknown>[]) => {
    if (!volunteers.length) return;
    const missing: Set<string> = new Set();
    const sample = volunteers.find((r) => r && Object.keys(r).length > 0) || volunteers[0];
    const zipKey = inferKey(sample, ['zip', 'zipcode', 'postal', 'postal code']);
    const countKey = inferKey(sample, ['# of volunteers', 'volunteers', 'count']);

    const byZip: CountByZip = {};
    volunteers.forEach((r) => {
      const z = normalizeZip(r[zipKey!]);
      const cRaw = countKey ? (r as any)[countKey] : 1;
      const c = parseCount(cRaw);
      if (!z) return;
      byZip[z] = (byZip[z] || 0) + c;
    });

    const markers: VolunteerMarker[] = [];
    Object.entries(byZip).forEach(([zip, count]) => {
      const pos = zipToLatLng(zip);
      if (!pos) { missing.add(zip); return; }
      markers.push({ lat: pos.lat, lng: pos.lng, count });
    });
    setVolunteerMarkers(markers);
    setUnknownZips(prev => Array.from(new Set([...prev, ...Array.from(missing.values())])).sort());
  };

  const processSchools = async (schools: Record<string, unknown>[]) => {
    if (!schools.length) {
      console.log('No schools data provided');
      return;
    }
    const failed: Set<string> = new Set();
    const sample = schools.find((r) => r && Object.keys(r).length > 0) || schools[0];
    
    // Look for "zipcode" column first (which contains addresses in this format)
    // Then fall back to other address field names
    const addressKey = inferKey(sample, ['zipcode', 'address', 'street address', 'street', 'location', 'full address']);
    // Look for "School Name" column first (exact match)
    // Then fall back to other name field names
    const nameKey = inferKey(sample, ['school name', 'school', 'name', 'campus', 'site']);

    console.log('Processing schools:', { addressKey, nameKey, count: schools.length });

    const pins: SchoolPin[] = [];
    
    // Process schools sequentially to avoid rate limiting
    for (const r of schools) {
      const address = addressKey ? String((r as any)[addressKey] ?? '').trim() : '';
      const name = nameKey ? String((r as any)[nameKey] ?? '').trim() : '';
      
      if (!address) {
        console.warn('Missing address for school:', name || 'Unknown');
        failed.add(name || 'Unknown');
        continue;
      }
      
      const pos = await geocodeAddress(address);
      if (!pos) {
        console.warn('Failed to geocode address:', address, 'for school:', name || 'Unknown');
        failed.add(`${name || 'Unknown'} (${address})`);
        continue;
      }
      
      // Create one pin per school with School Name as label
      const label = name || `School (${address})`;
      pins.push({ lat: pos.lat, lng: pos.lng, label });
      console.log('Geocoded school:', label, 'at', pos.lat, pos.lng);
      
      // Add small delay to respect Nominatim rate limits (max 1 request per second)
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    
    console.log('Finished processing schools. Total pins:', pins.length);
    setSchoolPins(pins);
    if (failed.size > 0) {
      console.warn('Failed schools (geocoding):', Array.from(failed.values()));
      // Don't add school geocoding failures to unknownZips - those are address geocoding issues, not ZIP centroid issues
    }
  };

  const handleBookDataUpload = async (file: File) => {
    setUploadedFiles(prev => ({ ...prev, bookData: file.name }));
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const recipientsRows = await readXlsxFile(file, { sheet: 'Book Recipients' }).catch(() => []);
      const recipients = rowsToObjects(recipientsRows as any[][]);
      processBookData(recipients);
    } else {
      const recipients = await parseCsv(file);
      processBookData(recipients);
    }
  };

  const handleVolunteersUpload = async (file: File) => {
    setUploadedFiles(prev => ({ ...prev, volunteers: file.name }));
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const volunteersRows = await readXlsxFile(file, { sheet: 'RIF Volunteers' }).catch(() => []);
      const volunteers = rowsToObjects(volunteersRows as any[][]);
      processVolunteers(volunteers);
    } else {
      const volunteers = await parseCsv(file);
      processVolunteers(volunteers);
    }
  };

  const handleSchoolsUpload = async (file: File) => {
    try {
      setIsProcessingSchools(true);
      setUploadedFiles(prev => ({ ...prev, schools: file.name }));
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const schoolsRows = await readXlsxFile(file, { sheet: 'RIF Schools' }).catch(() => []);
        const schools = rowsToObjects(schoolsRows as any[][]);
        console.log('Parsed schools from XLSX:', schools.length);
        await processSchools(schools);
      } else {
        const schools = await parseCsv(file);
        console.log('Parsed schools from CSV:', schools.length);
        await processSchools(schools);
      }
    } catch (error) {
      console.error('Error uploading schools:', error);
      alert('Error processing schools file. Please check the console for details.');
    } finally {
      setIsProcessingSchools(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="h-full w-full flex flex-col bg-white">
        <div className="px-5 pb-3 pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Upload Data</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="book-data-upload"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleBookDataUpload(file);
                      e.target.value = ''; // Reset input to allow re-uploading same file
                    }
                  }}
                  className="hidden"
                />
                <input
                  id="volunteers-upload"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleVolunteersUpload(file);
                      e.target.value = ''; // Reset input to allow re-uploading same file
                    }
                  }}
                  className="hidden"
                />
                <input
                  id="schools-upload"
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleSchoolsUpload(file);
                      e.target.value = ''; // Reset input to allow re-uploading same file
                    }
                  }}
                  className="hidden"
                />
                <UploadButton label="Book Data" htmlFor="book-data-upload" uploadedFileName={uploadedFiles.bookData} />
                <UploadButton label="Volunteers" htmlFor="volunteers-upload" uploadedFileName={uploadedFiles.volunteers} />
                <UploadButton label="Schools" htmlFor="schools-upload" uploadedFileName={uploadedFiles.schools} isProcessing={isProcessingSchools} />
              </div>
            </div>

            <div className="flex flex-1 justify-center">
              <div className="flex flex-wrap items-center gap-4 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <TogglePill checked={showHeatmap} onChange={setShowHeatmap} label="Heat Map" />
                <TogglePill checked={showVolunteers} onChange={setShowVolunteers} label="Volunteers" />
                <TogglePill checked={showSchools} onChange={setShowSchools} label="Schools" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex-1">
          {unknownZips.length > 0 && (
            <div className="absolute top-4 left-4 z-[1000] rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-700 shadow-lg">
              <button
                onClick={() => setIsZipWarningExpanded(!isZipWarningExpanded)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-100 transition-colors rounded-lg"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="flex-1">
                  {isZipWarningExpanded ? (
                    <>Missing ZIP centroids ({unknownZips.length}):</>
                  ) : (
                    <>
                      Missing ZIP centroids: {unknownZips.slice(0, 2).join(', ')}
                      {unknownZips.length > 2 ? ` +${unknownZips.length - 2} more` : ''}
                    </>
                  )}
                </span>
                <svg
                  className={`h-3 w-3 shrink-0 transition-transform ${isZipWarningExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isZipWarningExpanded && (
                <div className="border-t border-amber-200 px-3 py-2 max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-1">
                    {unknownZips.map((zip, idx) => (
                      <span
                        key={idx}
                        className="inline-block rounded bg-amber-100 px-2 py-0.5 font-mono text-xs"
                      >
                        {zip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <MapContainer center={NASHVILLE_CENTER} zoom={11} className="h-full w-full" style={{ background: '#eef2f6' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <HeatmapOverlay data={heatData} show={showHeatmap} />
          {showVolunteers &&
            volunteerMarkers.map((m, idx) => (
              <Marker key={`v-${idx}`} position={[m.lat, m.lng]} icon={volunteerIcon}>
                <Popup>
                  <div className="p-2">
                    <p className="text-sm text-gray-700">Volunteers in this area</p>
                    <p className="text-sm text-blue-600 font-semibold">{m.count}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          {showSchools &&
            schoolPins.map((s, idx) => (
              <Marker key={`s-${idx}`} position={[s.lat, s.lng]} icon={schoolIcon}>
                <Popup>
                  <div className="p-2">
                    <p className="text-sm text-gray-700">{s.label}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <Legend />
        </div>
      </div>
    </div>
  );
}
