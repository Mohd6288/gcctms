import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NATIONAL_ID_HASH_KEY = "test-only-key-do-not-use-in-real-envs";
});

describe("national-id encryption", () => {
  it("round-trips a plaintext Iqama through encrypt/decrypt", async () => {
    const { encryptNationalId, decryptNationalId } = await import("../../modules/platform/security/national-id");
    const plain = "2312345678";
    const enc = encryptNationalId(plain);
    expect(Buffer.isBuffer(enc)).toBe(true);
    expect(decryptNationalId(enc)).toBe(plain);
  });

  it("produces different ciphertext each time (random IV) but decrypts the same", async () => {
    const { encryptNationalId, decryptNationalId } = await import("../../modules/platform/security/national-id");
    const plain = "2312345678";
    const a = encryptNationalId(plain);
    const b = encryptNationalId(plain);
    expect(a.equals(b)).toBe(false);
    expect(decryptNationalId(a)).toBe(plain);
    expect(decryptNationalId(b)).toBe(plain);
  });

  it("hash is deterministic — the same Iqama always hashes the same, so duplicates are findable", async () => {
    const { hashNationalId } = await import("../../modules/platform/security/national-id");
    const plain = "2312345678";
    expect(hashNationalId(plain)).toBe(hashNationalId(plain));
  });

  it("different Iqamas hash differently", async () => {
    const { hashNationalId } = await import("../../modules/platform/security/national-id");
    expect(hashNationalId("2312345678")).not.toBe(hashNationalId("2398765432"));
  });
});
