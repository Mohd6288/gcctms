import { describe, expect, it } from "vitest";
import { acknowledgesUpload } from "../../components/documents/upload-acknowledgement";

// Finishing an upload used to be silent — the "Uploading…" text vanished, a
// badge in the far corner changed colour, and nothing said "done" where the
// person was looking. This is the predicate behind the confirmation that
// replaced that silence.
describe("acknowledgesUpload", () => {
  it("acknowledges an upload that finished cleanly", () => {
    expect(acknowledgesUpload(true, false, null)).toBe(true);
  });

  it("stays silent while the upload is still running", () => {
    expect(acknowledgesUpload(true, true, null)).toBe(false);
  });

  it("never acknowledges a failure", () => {
    // The whole point of the confirmation is that it means the file is safe.
    // Showing it after a failure is worse than showing nothing.
    expect(acknowledgesUpload(true, false, "Storage rejected the file")).toBe(false);
  });

  it("does not congratulate someone for arriving on the page", () => {
    expect(acknowledgesUpload(false, false, null)).toBe(false);
  });
});
