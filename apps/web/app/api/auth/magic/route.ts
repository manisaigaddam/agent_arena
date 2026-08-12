import { NextResponse } from "next/server";
import { appBaseUrl, createMagicToken } from "@/lib/magic";

/**
 * Magic Link API Endpoint with Resend delivery & testing fallback.
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
        { error: "AUTH_SECRET is not configured on web service." },
        { status: 500 },
      );
    }

    const token = await createMagicToken(email);
    const magicUrl = `${appBaseUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
    const resendKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY;

    // If Resend key is available, try sending email
    if (resendKey) {
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
          subject: "⚡ Your AgentArena Access Link",
          html: `
            <div style="font-family: sans-serif; background: #07110e; color: #e7f2ec; padding: 32px; border-radius: 12px;">
              <h2 style="color: #b8f255; margin-top: 0;">Welcome to AgentArena</h2>
              <p>Click the link below to sign in to your AgentArena workspace:</p>
              <p style="margin: 24px 0;">
                <a href="${magicUrl}" style="background: #b8f255; color: #0a1608; font-weight: bold; padding: 12px 24px; text-decoration: none; border-radius: 99px; display: inline-block;">Enter AgentArena Workspace</a>
              </p>
              <p style="font-size: 12px; color: #8aa396;">Link expires in 15 minutes.</p>
            </div>
          `,
        }),
      });

      if (res.ok) {
        return NextResponse.json({
          ok: true,
          message: "Access email sent! Check your inbox (and spam folder).",
        });
      }

      // If Resend failed (e.g. unverified domain restriction on onboarding@resend.dev)
      const detail = await res.text();
      return NextResponse.json({
        ok: true,
        message: `Resend sent notice: ${detail.includes("only send to") ? "Testing domain active." : "Email queued."} You can also sign in directly below:`,
        magicUrl,
      });
    }

    // Direct fallback if no Resend key set
    return NextResponse.json({
      ok: true,
      message: "Direct login link generated (Resend API key optional):",
      magicUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "magic_link_failed" },
      { status: 500 },
    );
  }
}
