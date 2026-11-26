import { Fragment, useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { MapPin, ChevronRight } from 'lucide-react';
import type { ClassItem, Store } from '@/lib/supabase';
import { CATEGORY_COLORS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';

type SchoolPin = { key: string; store: Store; classes: ClassItem[] };
type Props = {
  compact?: boolean;
  schools: (SchoolPin & { located: boolean })[];
  onSelectClass: (cls: ClassItem) => void;
  onSelectSchool: (schoolKey: string) => void;
};

type PlacedPin = {
  pin: SchoolPin;
  position: [number, number]; // where the marker is drawn
  truth: [number, number]; // the school's real location
  displaced: boolean;
};

// Custom marker icon using divIcon — no external image assets needed
const iconCache = new Map<string, L.DivIcon>();
function createMarkerIcon(colorClass: string) {
  const cached = iconCache.get(colorClass);
  if (cached) return cached;
  const icon = L.divIcon({
    className: '',
    html: `<div class="byc-marker ${colorClass}"><div class="byc-marker-dot"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
  iconCache.set(colorClass, icon);
  return icon;
}

const MARKER_COLORS: Record<string, string> = {
  'Martial Arts': 'marker-rose',
  Music: 'marker-violet',
  Dance: 'marker-pink',
  Art: 'marker-amber',
  Yoga: 'marker-emerald',
  Swimming: 'marker-sky',
  Languages: 'marker-indigo',
  Tennis: 'marker-lime',
  Basketball: 'marker-orange',
  Gym: 'marker-stone',
  Theater: 'marker-fuchsia',
  Football: 'marker-green',
};

// Pins closer than this many screen pixels are fanned out so each stays reachable.
const OVERLAP_PX = 30;

function spreadPins(map: L.Map, pins: SchoolPin[], zoom: number): PlacedPin[] {
  const items = pins.map((pin) => ({
    pin,
    pt: map.project(L.latLng(pin.store.latitude!, pin.store.longitude!), zoom),
  }));

  const groups: (typeof items)[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.some((o) => o.pt.distanceTo(item.pt) < OVERLAP_PX));
    if (group) group.push(item);
    else groups.push([item]);
  }

  const placed: PlacedPin[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      const { pin } = group[0];
      const truth: [number, number] = [pin.store.latitude!, pin.store.longitude!];
      placed.push({ pin, position: truth, truth, displaced: false });
      continue;
    }
    const cx = group.reduce((sum, g) => sum + g.pt.x, 0) / group.length;
    const cy = group.reduce((sum, g) => sum + g.pt.y, 0) / group.length;
    const radius = Math.max(26, group.length * 6);
    group.forEach(({ pin }, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / group.length;
      const spot = map.unproject(L.point(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)), zoom);
      placed.push({
        pin,
        position: [spot.lat, spot.lng],
        truth: [pin.store.latitude!, pin.store.longitude!],
        displaced: true,
      });
    });
  }
  return placed;
}

// Fit the map to all markers, only when the set of locations actually changes
function FitBounds({ pins }: { pins: SchoolPin[] }) {
  const map = useMap();
  const signature = pins.map((p) => `${p.store.id}:${p.store.latitude},${p.store.longitude}`).join('|');

  useEffect(() => {
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(
      pins.map((p) => [p.store.latitude!, p.store.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);

  return null;
}

function Pins({ pins, onSelectClass, onSelectSchool }: Omit<Props, 'schools'> & { pins: SchoolPin[] }) {
  const map = useMap();
  const { t, tCat, tArea } = useI18n();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const placed = useMemo(() => spreadPins(map, pins, zoom), [map, pins, zoom]);

  return (
    <>
      {placed.map(({ pin, position, truth, displaced }) => {
        const { store, classes: storeClasses } = pin;
        const mainCategory = storeClasses[0]?.category ?? store.category;
        const icon = createMarkerIcon(MARKER_COLORS[mainCategory] ?? 'marker-stone');
        return (
          <Fragment key={pin.key}>
            {displaced && (
              <>
                <Polyline
                  positions={[truth, position]}
                  pathOptions={{ color: '#57534e', weight: 1.5, opacity: 0.55, dashArray: '3 4' }}
                  interactive={false}
                />
                <CircleMarker
                  center={truth}
                  radius={3}
                  pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: '#57534e', fillOpacity: 1 }}
                  interactive={false}
                />
              </>
            )}
            <Marker position={position} icon={icon} alt={store.name}>
              <Tooltip direction="top" offset={[0, -26]} className="byc-tooltip">
                {store.name}
              </Tooltip>
              <Popup maxWidth={280} autoPanPadding={[24, 24]}>
                <div className="min-w-[200px] max-w-[240px]">
                  <p className="text-sm font-bold text-stone-900 leading-tight">{store.name}</p>
                  <div className="flex items-center gap-1 text-xs text-stone-500 mt-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" /> {tArea(store.area)}
                  </div>
                  {store.address && <p className="text-xs text-stone-400 mt-0.5">{store.address}</p>}
                  {store.accessibility_info && (
                    <p className="text-xs text-stone-400 mt-1">{store.accessibility_info}</p>
                  )}

                  {storeClasses.length > 0 ? (
                    <>
                      <div className="space-y-1.5 mt-2.5 max-h-40 overflow-y-auto">
                        {storeClasses.map((cls) => (
                          <button
                            key={cls.id}
                            onClick={() => onSelectClass(cls)}
                            className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-stone-800 truncate">{cls.title}</p>
                              <span
                                className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS[cls.category] ?? 'bg-stone-100 text-stone-700'}`}
                              >
                                {tCat(cls.category)}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelectSchool(pin.key)}
                    className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                  >
                    {t('map.viewProfile')} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}

export function MapView({ schools, onSelectClass, onSelectSchool, compact = false }: Props) {
  const { t } = useI18n();
  const pins = schools.filter((school) => school.located);
  const missing = schools.filter((school) => !school.located);

  return (
    <div className="w-full">
      <MapContainer
        center={[37.9715, 23.7563]}
        zoom={12}
        scrollWheelZoom={false}
        className={`w-full rounded-2xl border border-stone-200 shadow-sm ${compact ? 'h-72 sm:h-80' : 'h-[70vh] min-h-[380px] max-h-[600px]'}`}
      >
        <SchoolMapTiles />
        <FitBounds pins={pins} />
        <Pins pins={pins} onSelectClass={onSelectClass} onSelectSchool={onSelectSchool} />
      </MapContainer>
      {missing.length > 0 && (
        <p className="mt-3 text-sm text-stone-600">
          {t('map.missingLocations', { schools: missing.map(({ store }) => store.name).join(', ') })}
        </p>
      )}
    </div>
  );
}


function SchoolMapTiles() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

export function SchoolLocationMap({ school }: { school: Store }) {
  const { t, tArea } = useI18n();
  if (school.latitude == null || school.longitude == null) return null;
  const point: [number, number] = [school.latitude, school.longitude];

  return (
    <section aria-label={t('map.schoolLocation')} className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-stone-800">{t('map.schoolLocation')}</h3>
      <MapContainer
        key={`${point[0]},${point[1]}`}
        center={point}
        zoom={16}
        scrollWheelZoom={false}
        className="isolate h-56 w-full rounded-xl border border-stone-200"
      >
        <SchoolMapTiles />
        <Marker position={point} icon={createMarkerIcon('marker-indigo')} alt={school.name}>
          <Popup>
            <strong>{school.name}</strong><br />
            {school.address || tArea(school.area)}
          </Popup>
        </Marker>
      </MapContainer>
    </section>
  );
}
