import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const API_UPSTREAM = (
  process.env.API_URL ||
  process.env.PLATFORM_API_URL ||
  "http://api:3001"
).replace(/\/$/, "");

const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || "";

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  const userEmail = session?.user?.email || req.headers.get("x-user-email");
  if (!userEmail) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const targetPath = `/v1/${path.join("/")}`;
  const url = new URL(req.url);
  const target = `${API_UPSTREAM}${targetPath}${url.search}`;

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("x-user-email", userEmail);
  headers.set("x-user-id", session?.user?.id || userEmail);
  if (PLATFORM_API_KEY) headers.set("x-platform-key", PLATFORM_API_KEY);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return NextResponse.json(
      {
        error: "api_unreachable",
        detail: e instanceof Error ? e.message : String(e),
        upstream: target,
      },
      { status: 502 },
    );
  }

  const upstreamCt = upstream.headers.get("content-type") || "";
  const text = await upstream.text();
  if (
    upstreamCt.includes("application/json") ||
    text.trimStart().startsWith("{") ||
    text.trimStart().startsWith("[")
  ) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Zerops/proxy HTML (e.g. port mismatch) — never dump raw HTML into the UI
  return NextResponse.json(
    {
      error: upstream.status === 502 ? "bad_gateway" : "upstream_error",
      detail:
        upstream.status === 502
          ? "Upstream returned 502 — check service is listening on the configured port"
          : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280),
      status: upstream.status,
    },
    { status: upstream.status >= 400 ? upstream.status : 502 },
  );
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
