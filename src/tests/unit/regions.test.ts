import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CITIES, REGIONS, REGION_CITIES, citiesForRegion } from "../../lib/regions";

// The region/city lists exist in two places that can't import each other:
// this module, and the CHECK constraints in
// supabase/migrations/0028_drop_north_region.sql. Drift between them shows
// up as a runtime insert failure on a value the UI happily offered, so it's
// worth a test rather than a comment.
const MIGRATION = readFileSync("supabase/migrations/0028_drop_north_region.sql", "utf8");

describe("regions", () => {
  it("matches SEC's four contractor business areas — no Northern region", () => {
    expect([...REGIONS].sort()).toEqual(["Central", "East", "South", "West"]);
    expect(REGIONS).not.toContain("North");
  });

  it("gives every region at least one city, and no city belongs to two regions", () => {
    for (const region of REGIONS) {
      expect(REGION_CITIES[region].length).toBeGreaterThan(0);
    }
    expect(new Set(CITIES).size).toBe(CITIES.length);
  });

  it("returns nothing for an unset or unknown region, so the city select stays empty", () => {
    expect(citiesForRegion(null)).toEqual([]);
    expect(citiesForRegion("")).toEqual([]);
    expect(citiesForRegion("North")).toEqual([]);
  });

  it("agrees with the region CHECK constraints in migration 0028", () => {
    const regionList = `('${[...REGIONS].sort().join("', '")}')`;
    const constraintRegions = [...MIGRATION.matchAll(/in \('Central', 'East', 'West', 'South'\)/g)];
    expect(constraintRegions.length).toBe(6); // companies, pricing, training_requests, request_items, classes, regional_admin_assignments
    expect(regionList).toBe("('Central', 'East', 'South', 'West')");
    expect(MIGRATION).not.toMatch(/add constraint[\s\S]*'North'/);
  });

  it("agrees with the preferred_city CHECK constraint in migration 0028", () => {
    const cityCheck = MIGRATION.match(/preferred_city in \(([^)]*)\)/);
    expect(cityCheck).not.toBeNull();
    const constraintCities = cityCheck![1].split(",").map((c) => c.trim().replace(/'/g, ""));
    expect([...constraintCities].sort()).toEqual([...CITIES].sort());
  });
});
