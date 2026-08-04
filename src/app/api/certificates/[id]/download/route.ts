import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/modules/platform/auth/service";
import { getCertificateDownloadUrl } from "@/modules/certification/service";

// Authenticated download endpoint: checks permission + ownership, then
// redirects to a short-lived (<=5 min) signed URL — never a public link.
// Mirrors api/documents/[id]/download exactly.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const certificateId = Number(id);
  if (!Number.isInteger(certificateId)) {
    return NextResponse.json({ error: "Invalid certificate id" }, { status: 400 });
  }

  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = await getCertificateDownloadUrl(context, certificateId);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not found";
    const status = message === "Not authorized" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
