import { describe, expect, it } from "vitest";
import { isNavItemActive } from "@/components/layout/nav-active";

describe("isNavItemActive", () => {
  it("keeps the section highlighted on its detail pages", () => {
    expect(isNavItemActive("/admin/requests/42", { href: "/admin/requests" })).toBe(true);
  });

  it("does not highlight a section from a sibling sharing its prefix", () => {
    expect(isNavItemActive("/admin/classesomething", { href: "/admin/classes" })).toBe(false);
  });

  it("matches a portal home exactly so it isn't active on every child route", () => {
    expect(isNavItemActive("/admin", { href: "/admin", end: true })).toBe(true);
    expect(isNavItemActive("/admin/reports", { href: "/admin", end: true })).toBe(false);
  });
});
