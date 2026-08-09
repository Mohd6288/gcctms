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

// Cities used to live here as a hardcoded REGION_CITIES map. They are now
// rows in the `cities` table (0032_cities.sql) so a super_admin can add one
// without a deploy, and so training_requests.preferred_city can be a real
// foreign key instead of a CHECK that needed a migration per city.
//
// Regions deliberately did NOT move: they are SEC's Registration Sheet
// droplist rather than GCC Lab's to invent, and this tuple feeds z.enum()
// literal unions across eight modules plus six CHECK constraints.
