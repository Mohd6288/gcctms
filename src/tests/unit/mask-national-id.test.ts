import { beforeAll, describe, expect, it } from "vitest";
import { encryptNationalId, maskNationalId } from "../../modules/platform/security/national-id";

// The Iqama is the most sensitive column in the database. Until the directory
// existed it was decrypted in exactly one place — printed onto the certificate
// PDF — and shown to nobody. maskNationalId is the only other way it leaves
// the encrypted column, so a regression here is a PII leak, not a display bug.
describe("maskNationalId", () => {
  beforeAll(() => {
    process.env.NATIONAL_ID_HASH_KEY ??= "test-only-key-do-not-use-in-real-envs";
  });

  it("reveals only the last four digits", () => {
    const masked = maskNationalId(encryptNationalId("2412345678"));
    expect(masked).toBe("••••••5678");
    expect(masked).toHaveLength("2412345678".length);
  });

  it("never contains the leading digits of the real number", () => {
    const iqama = "2987654321";
    const masked = maskNationalId(encryptNationalId(iqama))!;
    expect(masked).not.toContain(iqama);
    // The first six digits must not survive in any form.
    expect(masked).not.toContain(iqama.slice(0, 6));
    expect(masked.replace(/•/g, "")).toBe("4321");
  });

  it("masks a short value completely rather than revealing all of it", () => {
    expect(maskNationalId(encryptNationalId("123"))).toBe("•••");
    expect(maskNationalId(encryptNationalId("1234"))).toBe("••••");
  });

  it("returns null for a missing or unreadable value instead of throwing", () => {
    // One corrupt row must not take down a whole directory page, and "no
    // number on file" is the honest thing to render.
    expect(maskNationalId(null)).toBeNull();
    expect(maskNationalId(Buffer.alloc(0))).toBeNull();
    expect(maskNationalId(Buffer.from("not a valid ciphertext at all"))).toBeNull();
  });
});
