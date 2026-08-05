import { NextResponse } from "next/server";
import { getContext } from "@/modules/platform/auth/service";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARY diagnostic route — super_admin-gated, lists a user's enrolled
// TOTP factors to debug a real-MFA login rejecting a correct code. Remove
// after use.
export async function GET(request: Request) {
  const context = await getContext();
  if (!context || context.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "missing email query param" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userList, error: userError } = await admin.auth.admin.listUsers();
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  const user = userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const { data: factors, error: factorsError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (factorsError) {
    return NextResponse.json({ error: factorsError.message }, { status: 500 });
  }

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    lastSignInAt: user.last_sign_in_at,
    factors: factors.factors.map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name,
      factorType: f.factor_type,
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const context = await getContext();
  if (!context || context.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { email, factorId } = (await request.json()) as { email?: string; factorId?: string };
  if (!email || !factorId) {
    return NextResponse.json({ error: "missing email or factorId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userList, error: userError } = await admin.auth.admin.listUsers();
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  const user = userList.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factorId, userId: user.id });
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: factorId });
}
