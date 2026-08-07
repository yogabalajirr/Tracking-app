import { getCurrentUser } from "@/lib/auth";
import { subscribe, type AppEvent } from "@/lib/events";

/** SSE must stream, so this route can never be statically rendered. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream for the signed-in user.
 *
 * Only events for the caller's workspace are forwarded, and notification
 * events are additionally filtered to the caller — the stream is a tenant
 * boundary just like the database layer.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      const onEvent = (event: AppEvent) => {
        if (event.workspaceId !== user.workspaceId) return;
        if (event.type === "notification.created" && event.userId !== user.id) return;
        send(event.type, event);
      };

      const unsubscribe = subscribe(onEvent);

      // Comment frames keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      }

      request.signal.addEventListener("abort", cleanup);
      send("ready", { ok: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so events arrive immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
