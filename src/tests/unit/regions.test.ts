import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGIONS } from "../../lib/regions";

// The region list exists in two places that can't import each other: this
// module, and the CHECK constraints in supabase/migrations. Drift shows up
// as a runtime insert failure on a value the UI happily offered, so it's
// worth a test rather than a comment.
//
// Cities used to be asserted here too. They're rows in the `cities` table
// now (0032_cities.sql), with training_requests.preferred_city a foreign key
// onto them — the database enforces what these assertions used to, and
// enforcing it in two places is what created the drift risk to begin with.
const MIGRATION = readFileSync("supabase/migrations/0028_drop_north_region.sql", "utf8");
const CITIES_MIGRATION = readFileSync("supabase/migrations/0032_cities.sql", "utf8");

describe("regions", () => {
  it("matches SEC's four contractor business areas — no Northern region", () => {
    expect([...REGIONS].sort()).toEqual(["Central", "East", "South", "West"]);
    expect(REGIONS).not.toContain("North");
  });

  it("agrees with the region CHECK constraints in migration 0028", () => {
    const regionList = `('${[...REGIONS].sort().join("', '")}')`;
    const constraintRegions = [...MIGRATION.matchAll(/in \('Central', 'East', 'West', 'South'\)/g)];
    expect(constraintRegions.length).toBe(6); // companies, pricing, training_requests, request_items, classes, regional_admin_assignments
    expect(regionList).toBe("('Central', 'East', 'South', 'West')");
    expect(MIGRATION).not.toMatch(/add constraint[\s\S]*'North'/);
  });

  it("keeps the cities table's own region CHECK in step with the tuple", () => {
    expect(CITIES_MIGRATION).toMatch(/region text not null check \(region in \('Central', 'East', 'West', 'South'\)\)/);
  });

  it("enforces preferred_city with a foreign key rather than a per-city CHECK", () => {
    // The point of the move: adding a city is data, not a migration.
    expect(CITIES_MIGRATION).toMatch(/drop constraint training_requests_preferred_city_check/);
    expect(CITIES_MIGRATION).toMatch(/foreign key \(preferred_city\) references cities \(name\)/);
  });
});
