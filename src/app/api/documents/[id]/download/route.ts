import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/modules/platform/auth/service";
import { getSignedDownloadUrl } from "@/modules/platform/storage/service";

// Authenticated download endpoint: checks permission, then redirects to a
// short-lived (<=5 min) signed URL — never a public/permanent link. See
// security-and-hosting.md's Storage section and project-structure.md's
// "api/ ... signed-url issuer" convention.
//
// ?url=1 returns the signed URL as JSON instead of redirecting, so an <img>
// or <iframe> can point straight at Storage. Previewing through the redirect
// would work too, but this response carries X-Frame-Options: DENY from
// next.config.ts, and browsers differ on whether that kills a framed
// redirect — handing the client the URL sidesteps the question entirely.
// Same permission check either way; the URL still expires in <=5 min and is
// never logged.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = await getSignedDownloadUrl(context, documentId);
    if (request.nextUrl.searchParams.get("url") === "1") {
      return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not found";
    const status = message === "Not authorized" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
