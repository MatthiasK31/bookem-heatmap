import React, { useEffect, useState, createElement, Component } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { BookOpenIcon, UserIcon, SchoolIcon } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Nashville coordinates
const NASHVILLE_CENTER: [number, number] = [36.1627, -86.7816];
// Sample data for books per zip code (heat map points)
const bookData = [{
  lat: 36.1627,
  lng: -86.7816,
  count: 450
}, {
  lat: 36.154,
  lng: -86.784,
  count: 320
}, {
  lat: 36.1447,
  lng: -86.8027,
  count: 280
}, {
  lat: 36.1215,
  lng: -86.6774,
  count: 510
}, {
  lat: 36.2088,
  lng: -86.7644,
  count: 390
}, {
  lat: 36.132,
  lng: -86.7903,
  count: 420
}, {
  lat: 36.181,
  lng: -86.7156,
  count: 360
}, {
  lat: 36.1156,
  lng: -86.8677,
  count: 290
}, {
  lat: 36.0678,
  lng: -86.7844,
  count: 340
}, {
  lat: 36.1989,
  lng: -86.8473,
  count: 310
}];
// Sample volunteer locations
const volunteers = [{
  id: 1,
  lat: 36.1627,
  lng: -86.7816,
  name: 'Sarah Johnson',
  books: 45
}, {
  id: 2,
  lat: 36.154,
  lng: -86.784,
  name: 'Mike Davis',
  books: 32
}, {
  id: 3,
  lat: 36.1447,
  lng: -86.8027,
  name: 'Emily Chen',
  books: 28
}, {
  id: 4,
  lat: 36.1215,
  lng: -86.6774,
  name: 'James Wilson',
  books: 51
}, {
  id: 5,
  lat: 36.2088,
  lng: -86.7644,
  name: 'Lisa Martinez',
  books: 39
}];
// Sample school locations
const schools = [{
  id: 1,
  lat: 36.165,
  lng: -86.78,
  name: 'Nashville Central High',
  students: 850
}, {
  id: 2,
  lat: 36.15,
  lng: -86.79,
  name: 'Green Valley Elementary',
  students: 420
}, {
  id: 3,
  lat: 36.14,
  lng: -86.81,
  name: 'Riverside Middle School',
  students: 650
}, {
  id: 4,
  lat: 36.125,
  lng: -86.68,
  name: 'Hermitage High School',
  students: 920
}, {
  id: 5,
  lat: 36.21,
  lng: -86.76,
  name: 'Germantown Academy',
  students: 380
}];
// Custom marker icons
const createCustomIcon = (color: string, IconComponent: any) => {
  return L.divIcon({
    html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${IconComponent === 'user' ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>' : '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'}
      </svg>
    </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};
const volunteerIcon = createCustomIcon('#3b82f6', 'user');
const schoolIcon = createCustomIcon('#10b981', 'school');
// Custom heatmap component using canvas
function HeatmapOverlay({
  data,
  show
}: {
  data: typeof bookData;
  show: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!show) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const overlay = L.imageOverlay('', map.getBounds(), {
      opacity: 0.6,
      interactive: false
    }).addTo(map);
    const updateHeatmap = () => {
      const bounds = map.getBounds();
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw heat points
      data.forEach(point => {
        const pos = map.latLngToContainerPoint([point.lat, point.lng]);
        const intensity = point.count / 600; // Normalize to 0-1
        // Create radial gradient
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 50);
        // Color based on intensity
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
  return <div className="absolute bottom-8 right-8 bg-white rounded-lg shadow-lg p-4 z-[1000]">
      <h3 className="font-semibold text-gray-800 mb-3">Legend</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gradient-to-r from-blue-400 to-red-500 rounded"></div>
          <span className="text-sm text-gray-700">Book Heat Map</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-full border-2 border-white"></div>
          <span className="text-sm text-gray-700">Volunteers</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-green-500 rounded-full border-2 border-white"></div>
          <span className="text-sm text-gray-700">Schools</span>
        </div>
      </div>
    </div>;
}
export function App() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showVolunteers, setShowVolunteers] = useState(true);
  const [showSchools, setShowSchools] = useState(true);
  return <div className="w-full h-screen flex flex-col bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-3">
            Nashville Book Distribution Map
          </h1>
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">Show Heat Map</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showVolunteers} onChange={e => setShowVolunteers(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">
                Show Volunteers ({volunteers.length})
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showSchools} onChange={e => setShowSchools(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm text-gray-700">
                Show Schools ({schools.length})
              </span>
            </label>
          </div>
        </div>
      </div>
      <div className="flex-1 relative">
        <MapContainer center={NASHVILLE_CENTER} zoom={11} className="w-full h-full" style={{
        background: '#f3f4f6'
      }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          <HeatmapOverlay data={bookData} show={showHeatmap} />
          {showVolunteers && volunteers.map(volunteer => <Marker key={volunteer.id} position={[volunteer.lat, volunteer.lng]} icon={volunteerIcon}>
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-gray-800 mb-1">
                      {volunteer.name}
                    </h3>
                    <p className="text-sm text-gray-600">Volunteer</p>
                    <p className="text-sm text-blue-600 font-medium mt-1">
                      {volunteer.books} books distributed
                    </p>
                  </div>
                </Popup>
              </Marker>)}
          {showSchools && schools.map(school => <Marker key={school.id} position={[school.lat, school.lng]} icon={schoolIcon}>
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-gray-800 mb-1">
                      {school.name}
                    </h3>
                    <p className="text-sm text-gray-600">School</p>
                    <p className="text-sm text-green-600 font-medium mt-1">
                      {school.students} students
                    </p>
                  </div>
                </Popup>
              </Marker>)}
        </MapContainer>
        <Legend />
      </div>
    </div>;
}