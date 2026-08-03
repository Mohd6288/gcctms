import { describe, expect, it } from "vitest";
import { mfaRequiredFor, ROLES } from "../../modules/platform/auth/shared";

describe("mfaRequiredFor — skippable only for contractor_manager", () => {
  it("requires MFA for super_admin, platform_admin, and trainer", () => {
    expect(mfaRequiredFor("super_admin")).toBe(true);
    expect(mfaRequiredFor("platform_admin")).toBe(true);
    expect(mfaRequiredFor("trainer")).toBe(true);
  });

  it("does not require MFA for contractor_manager", () => {
    expect(mfaRequiredFor("contractor_manager")).toBe(false);
  });

  it("contractor_manager is the only role that skips it", () => {
    const skippable = ROLES.filter((role) => !mfaRequiredFor(role));
    expect(skippable).toEqual(["contractor_manager"]);
  });
});
