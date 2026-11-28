import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { studioInputCls, studioLabelCls } from '@/lib/studioForm';

type Point = { latitude: number; longitude: number };
type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
};
type Suggestion = { label: string; point: Point };

const areaCenters: Record<string, [number, number]> = {
  Pagrati: [37.969, 23.744], Vironas: [37.961, 23.752], Kaisariani: [37.964, 23.767],
  Ilioupoli: [37.931, 23.750], 'Agios Dimitrios': [37.933, 23.735], Glyfada: [37.865, 23.752],
  'Nea Smyrni': [37.945, 23.714], Kallithea: [37.953, 23.698], 'Athens Center': [37.984, 23.728],
  Acharnes: [38.083, 23.733], 'Kato Patisia': [38.017, 23.730], Zografou: [37.976, 23.773],
  'Ano Patisia': [38.025, 23.735], Kypseli: [37.999, 23.738], Galatsi: [38.016, 23.752],
  'Nea Ionia': [38.036, 23.757], 'Nea Filadelfeia': [38.035, 23.738], Peristeri: [38.013, 23.692],
  Aigaleo: [37.993, 23.681], Petroupoli: [38.042, 23.684], Ilion: [38.033, 23.703], Marousi: [38.056, 23.806],
  Chalandri: [38.023, 23.800], Kifisia: [38.074, 23.811], 'Agia Paraskevi': [38.017, 23.821],
  Cholargos: [38.000, 23.798], Alimos: [37.917, 23.719], Elliniko: [37.893, 23.741],
  Argyroupoli: [37.905, 23.750], 'Palaio Faliro': [37.929, 23.700], Dafni: [37.950, 23.737],
  Ymittos: [37.953, 23.752], Piraeus: [37.943, 23.647], 'Neos Kosmos': [37.958, 23.728],
  Koukaki: [37.965, 23.723], Ampelokipoi: [37.992, 23.759], Exarchia: [37.989, 23.734], Sepolia: [38.001, 23.711],
};

function formatFeature(feature: PhotonFeature): Suggestion | null {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const streetLine = [properties.street, properties.housenumber].filter(Boolean).join(' ');
  const primary = streetLine || properties.name || properties.district || properties.city;
  const locality = properties.district || properties.city || properties.county || properties.state;
  const parts = [primary, locality, properties.postcode].filter((part, index, all) =>
    Boolean(part) && all.findIndex((candidate) => candidate?.toLocaleLowerCase() === part?.toLocaleLowerCase()) === index,
  );
  if (!parts.length) return null;
  return { label: parts.join(', '), point: { latitude, longitude } };
}

export function SchoolAddressPicker({
  address,
  area,
  latitude,
  longitude,
  onAddressChange,
  onPointChange,
}: {
  address: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  onAddressChange: (address: string) => void;
  onPointChange: (point: Point | null) => void;
}) {
  const { t, lang } = useI18n();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autoPinForAddress, setAutoPinForAddress] = useState(latitude == null || longitude == null);
  const previousArea = useRef(area);
  const selectedPoint = latitude != null && longitude != null ? { latitude, longitude } : null;
  const center = useMemo<[number, number]>(() => areaCenters[area] ?? [37.9838, 23.7275], [area]);

  useEffect(() => {
    if (previousArea.current !== area) {
      previousArea.current = area;
      setAutoPinForAddress(true);
    }
  }, [area]);

  useEffect(() => {
    const query = address.trim();
    if (query.length < 4) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          q: `${query}${area ? `, ${area}` : ''}, Greece`,
          countrycode: 'GR',
          limit: '6',
          lang: lang === 'el' ? 'el' : 'en',
          lat: String(center[0]),
          lon: String(center[1]),
          zoom: '13',
          location_bias_scale: '0.2',
        });
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Address search failed');
        const data = await response.json() as { features?: PhotonFeature[] };
        const matches = (data.features ?? []).map(formatFeature).filter((item): item is Suggestion => item !== null);
        setSuggestions(matches);
        if (autoPinForAddress && matches[0]) onPointChange(matches[0].point);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, area, autoPinForAddress, center, lang, onPointChange]);

  const chooseSuggestion = (suggestion: Suggestion) => {
    setAutoPinForAddress(false);
    onAddressChange(suggestion.label);
    onPointChange(suggestion.point);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div>
      <label className={studioLabelCls}>{t('lf.address')}</label>
      <div className="relative z-[1100]">
        <input
          value={address}
          onChange={(event) => {
            setAutoPinForAddress(true);
            onAddressChange(event.target.value);
            onPointChange(null);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
          autoComplete="street-address"
          required
          className={studioInputCls}
          aria-autocomplete="list"
          aria-expanded={showSuggestions && suggestions.length > 0}
        />
        {showSuggestions && (searching || suggestions.length > 0) && (
          <div className="absolute z-[1101] mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
            {searching && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{t('listing.addressSearching')}
              </div>
            )}
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.label}-${index}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSuggestion(suggestion)}
                className="flex w-full items-start gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm text-stone-700 hover:bg-teal-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-stone-500">{t('listing.addressHelp')}</p>
      <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${selectedPoint ? 'text-teal-700' : 'text-amber-700'}`}>
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {selectedPoint ? t('listing.addressSelected') : t('listing.addressPinRequired')}
      </p>
    </div>
  );
}
