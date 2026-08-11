import { getContext } from "@/modules/platform/auth/service";
import { getRequestFormAccess } from "@/modules/requests/queries";
import { getTestRequestFormData, renderTestRequestFormPdf } from "@/modules/requests/test-request-form";

// نموذج طلب اختبار, on demand.
//
// A route rather than a stored document: it is a rendering of the request, so
// storing a copy would create a second version of the truth that goes stale the
// moment an employee is added. Generated when asked for, always current.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) return new Response("Not found", { status: 404 });

  const context = await getContext();
  if (!context) return new Response("Not authorized", { status: 401 });

  // Scoped explicitly. Drizzle connects as owner and bypasses RLS, so this
  // route is reachable by id regardless of who owns the request — the check
  // has to be here, not assumed from the query.
  const access = await getRequestFormAccess(requestId);
  if (!access) return new Response("Not found", { status: 404 });
  const allowed =
    context.role === "platform_admin" ||
    context.role === "super_admin" ||
    context.role === "auditor" ||
    (context.role === "contractor_manager" && context.companyId === access.companyId);
  if (!allowed) return new Response("Not authorized", { status: 403 });

  const data = await getTestRequestFormData(requestId);
  if (!data) return new Response("Not found", { status: 404 });

  const pdf = await renderTestRequestFormPdf(data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="test-request-${requestId}.pdf"`,
      // Never cached by a shared cache: it carries company and technician
      // details and is scoped to who asked for it.
      "Cache-Control": "private, no-store",
    },
  });
}
