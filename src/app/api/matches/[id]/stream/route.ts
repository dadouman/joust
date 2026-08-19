import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const POLL_MS = 200;

/** SSE endpoint — quasi temps réel (< 200 ms) compatible Vercel. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let lastKey = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: update\ndata: ${data}\n\n`));
        } catch { /* disconnected */ }
      };

      const timer = setInterval(async () => {
        try {
          const [m] = await db
            .select({
              updatedAt: matches.updatedAt,
              lastFen: matches.lastFen,
              status: matches.status,
              lastMoveAt: matches.lastMoveAt,
            })
            .from(matches)
            .where(eq(matches.id, id))
            .limit(1);

          if (!m) { send(JSON.stringify({ type: "gone" })); return; }

          const key = `${m.updatedAt.toISOString()}|${m.lastFen ?? ""}|${m.status}|${m.lastMoveAt?.toISOString() ?? ""}`;
          if (key !== lastKey) {
            lastKey = key;
            send(JSON.stringify({ type: "changed" }));
          }
        } catch { /* retry next tick */ }
      }, POLL_MS);

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: keep-alive\n\n`)); } catch { /* ignore */ }
      }, 15000);

      _request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}