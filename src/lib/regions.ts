// Single source of truth for SEC's contractor business areas and the cities
// GCC Lab delivers in. Previously this tuple was copy-pasted into 14 files
// and 6 CHECK constraints, which is how "North" survived in the code long
// after the source documents stopped listing it.
//
// The four regions are exactly the Registration Sheet's
// "منطقة الاعمال التابع له المقاول / The contractor's area" droplist:
// الغربية Western, الوسطى Central, الجنوبية Southern, الشرقية Eastern.
// There is no Northern region in SEC's contractor matrix, and the three GCC
// Lab price workbooks cover only these four (Southern and Western share one
// sheet at the same rate).
export const REGIONS = ["Central", "East", "West", "South"] as const;
export type Region = (typeof REGIONS)[number];

// GCC Lab's own training institutes, from HRBL_0004_FO_001's
// "مكان تقديم الدورة" list: معهد تدريب الرياض / جدة / أبها / الدمام. A course
// delivered anywhere else is an on-site or external-institute booking, which
// the request's training type already covers — so this is the full list, not
// a sample of Saudi cities.
export const REGION_CITIES = {
  Central: ["Riyadh"],
  East: ["Dammam"],
  West: ["Jeddah"],
  South: ["Abha"],
} as const satisfies Record<Region, readonly string[]>;

export const CITIES = Object.values(REGION_CITIES).flat();

export function citiesForRegion(region: string | null | undefined): readonly string[] {
  if (!region) return [];
  return REGION_CITIES[region as Region] ?? [];
}
