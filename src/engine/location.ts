import type { LocationTier } from './types';

/**
 * Approximate postcode → location tier, used only when `location_tier` is blank.
 * Ranges are coarse approximations of capital-city metro areas and major regional
 * cities; they are a screening convenience, not an official ABS classification.
 */
type Range = [number, number];
const CBD: Range[] = [[2000, 2001], [3000, 3001], [4000, 4001], [5000, 5001], [6000, 6001], [7000, 7001], [2600, 2601], [800, 801]];
const METRO: Range[] = [
  [2000, 2234], [2555, 2574], [2740, 2786], // Sydney
  [3000, 3207], [3335, 3341], [3427, 3442], [3750, 3810], [3910, 3920], [3926, 3944], [3975, 3978], // Melbourne
  [4000, 4207], [4300, 4305], [4500, 4519], // Brisbane
  [5000, 5199], // Adelaide
  [6000, 6199], // Perth
  [7000, 7099], // Hobart
  [2600, 2620], [2900, 2914], // Canberra
  [800, 832], // Darwin
];
const REGIONAL_CITY: Range[] = [
  [2250, 2263], [2280, 2300], [2500, 2530], // Central Coast, Newcastle, Wollongong
  [3211, 3226], [3350, 3356], [3550, 3556], // Geelong, Ballarat, Bendigo
  [4208, 4230], [4550, 4575], [4350, 4350], [4810, 4818], [4868, 4879], // Gold Coast, Sunshine Coast, Toowoomba, Townsville, Cairns
  [7248, 7250], // Launceston
];
const REMOTE: Range[] = [[850, 886], [6700, 6770], [4825, 4830], [5700, 5734], [2836, 2840], [2880, 2880]];

const inAny = (n: number, rs: Range[]) => rs.some(([a, b]) => n >= a && n <= b);

export function tierFromPostcode(postcode: string | undefined): LocationTier | undefined {
  if (!postcode) return undefined;
  const n = Number(String(postcode).trim());
  if (!Number.isFinite(n)) return undefined;
  if (inAny(n, CBD)) return 'metro_cbd';
  if (inAny(n, REGIONAL_CITY)) return 'regional_city';
  if (inAny(n, METRO)) return 'metro';
  if (inAny(n, REMOTE)) return 'remote';
  return 'regional';
}
