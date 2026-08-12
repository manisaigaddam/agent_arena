import { NextResponse } from "next/server";
import { appBaseUrl, createMagicToken } from "@/lib/magic";

/**
 * Email magic link — verification requires delivering the link by email.
 * The link is NEVER returned in the API response.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "valid_email_required" },
        { status: 400 },
      );
    }

    if (!process.env.AUTH_SECRET) {
      return NextResponse.json(
        { error: "AUTH_SECRET is not configured on web" },
        { status: 500 },
      );
    }

    const resendKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json(
        {
          error:
            "AUTH_RESEND_KEY is required. Magic links must be emailed — set a Resend API key on the web service.",
        },
        { status: 503 },
      );
    }

    const token = await createMagicToken(email);
    const magicUrl = `${appBaseUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
    const from =
      process.env.AUTH_EMAIL_FROM || "AgentArena <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your AgentArena sign-in link",
        html: `<p>Click to sign in to AgentArena (expires in 15 minutes):</p><p><a href="${magicUrl}">${magicUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: "email_send_failed", detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Check your email for the magic link.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "magic_link_failed" },
      { status: 500 },
    );
  }
}
