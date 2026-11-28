import { LISTING_AREAS } from '@/lib/listingForm';

const GREEK_VYRONAS = String.fromCodePoint(0x03b2, 0x03c5, 0x03c1, 0x03c9, 0x03bd, 0x03b1, 0x03c2);

function areaKey(value: string | null | undefined) {
  const key = (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');

  if (key === 'vyronas' || key === 'byronas' || key === GREEK_VYRONAS) return 'vironas';
  return key;
}

export function areasMatch(left: string | null | undefined, right: string | null | undefined) {
  const leftKey = areaKey(left);
  return leftKey !== '' && leftKey === areaKey(right);
}

export function filterAreaOptions(existingAreas: readonly string[]) {
  const seen = new Set<string>();
  const options = [
    ...LISTING_AREAS,
    ...existingAreas.map((value) => ({ value, key: null })),
  ];

  return options.filter(({ value }) => {
    const key = areaKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
