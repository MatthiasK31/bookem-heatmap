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

const volunteerIcon = createCustomIcon('#3b82f6', 'user');
const schoolIcon = createCustomIcon('#10b981', 'school');

// Helpers
const metersPerPixel = (lat: number, zoom: number) => 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
const milesToMeters = (miles: number) => miles * 1609.344;
const HEAT_DIAMETER_MILES = 0.5; // as requested
const HEAT_RADIUS_METERS = milesToMeters(HEAT_DIAMETER_MILES) / 2; // 0.25-mile radius

// Convert ZIP to coordinates using local centroids map
function zipToLatLng(zip: string | number): { lat: number; lng: number } | undefined {
  const z = String(zip).trim();
  const rec = (zipCentroids as Record<string, { lat: number; lng: number }>)[z];
  if (!rec) return undefined;
  return { lat: rec.lat, lng: rec.lng };
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

      data.forEach((point) => {
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const intensity = Math.min(1, point.count / 600); // Normalize to 0-1 with cap
        // Convert fixed radius in meters to pixels at current zoom/latitude
        const pxRadius = HEAT_RADIUS_METERS / metersPerPixel(point.lat, map.getZoom());
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, pxRadius);

        if (intensity < 0.3) {
          gradient.addColorStop(0, `rgba(0, 0, 255, ${intensity * 2})`);
          gradient.addColorStop(1, 'rgba(0, 0, 255, 0)');
        } else if (intensity < 0.6) {
          gradient.addColorStop(0, `rgba(0, 255, 255, ${intensity * 1.5})`);
          gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
        } else if (intensity < 0.8) {
          gradient.addColorStop(0, `rgba(255, 255, 0, ${intensity * 1.2})`);
          gradient.addColorStop(1, 'rgba(255, 255, 0, 0)');
        } else {
          gradient.addColorStop(0, `rgba(255, 0, 0, ${intensity})`);
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    <div className="absolute bottom-8 right-8 bg-white rounded-lg shadow-lg p-4 z-[1000]">
      <h3 className="font-semibold text-gray-800 mb-3">Legend</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-r from-blue-400 to-red-500 rounded" />
          <span className="text-sm text-gray-700">Book Heat Map</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-full border-2 border-white" />
          <span className="text-sm text-gray-700">Volunteers</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-500 rounded-full border-2 border-white" />
          <span className="text-sm text-gray-700">Schools</span>
        </div>
      </div>
    </div>
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
        const zRaw = r[zipKey!];
        const z = typeof zRaw === 'number' ? String(Math.trunc(zRaw)) : String(zRaw ?? '').replace(/\D/g, '');
        const cRaw = booksKey ? (r as any)[booksKey] : 1;
        const c = Number(cRaw) || 0;
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
        const zRaw = r[zipKey!];
        const z = typeof zRaw === 'number' ? String(Math.trunc(zRaw)) : String(zRaw ?? '').replace(/\D/g, '');
        const cRaw = countKey ? (r as any)[countKey] : 1;
        const c = Number(cRaw) || 0;
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

    // Schools → create N pins per ZIP (slight jitter so pins are clickable), with placeholder labels
    if (schools.length) {
      const sample = schools.find((r) => r && Object.keys(r).length > 0) || schools[0];
      const zipKey = inferKey(sample, ['zip', 'zipcode', 'postal', 'postal code']);
      const countKey = inferKey(sample, ['# of schools', 'schools', 'count']);

      const pins: SchoolPin[] = [];
      schools.forEach((r) => {
        const zRaw = r[zipKey!];
        const z = typeof zRaw === 'number' ? String(Math.trunc(zRaw)) : String(zRaw ?? '').replace(/\D/g, '');
        const c = Number((r as any)[countKey!]) || 0;
        if (!z || c <= 0) return;
        const pos = zipToLatLng(z);
        if (!pos) { missing.add(z); return; }
        for (let i = 0; i < c; i++) {
          const j = jitter(pos.lat, pos.lng, 60); // jitter by ~60m
          pins.push({ lat: j.lat, lng: j.lng, label: `School (${z})` });
        }
      });
      setSchoolPins(pins);
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

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-3">Nashville Book Distribution Map</h1>
          <div className="flex gap-4 flex-wrap items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show Heat Map</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showVolunteers}
                onChange={(e) => setShowVolunteers(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show Volunteers</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSchools}
                onChange={(e) => setShowSchools(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">Show Schools</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                multiple
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const fl = e.target.files;
                  if (fl && fl.length > 0) handleFiles(fl);
                }}
                className="block text-sm text-gray-700"
              />
              <span className="text-xs text-gray-500">Upload .xlsx workbook or CSVs (Book Recipients, RIF Volunteers, RIF Schools)</span>
            </div>

            {unknownZips.length > 0 && (
              <div className="text-xs text-amber-600">
                Missing ZIP centroids for: {unknownZips.slice(0, 6).join(', ')}{unknownZips.length > 6 ? '…' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer center={NASHVILLE_CENTER} zoom={11} className="w-full h-full" style={{ background: '#f3f4f6' }}>
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
  );
}
