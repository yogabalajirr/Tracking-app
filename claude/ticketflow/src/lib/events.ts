import { EventEmitter } from "node:events";

/**
 * In-process pub/sub backing the Server-Sent Events stream.
 *
 * TicketFlow's target deployment is a single Node process (the macOS app, or one
 * container), where this is all that's needed for real-time updates. Behind a
 * multi-instance load balancer you would replace the emitter with Redis pub/sub
 * or Ably — `publish()` and `subscribe()` are the only two functions that would
 * change. See DECISIONS.md.
 */

export type AppEvent =
  | { type: "ticket.created"; workspaceId: string; ticketId: string; number: number }
  | { type: "ticket.updated"; workspaceId: string; ticketId: string }
  | { type: "message.created"; workspaceId: string; ticketId: string; messageId: string }
  | {
      type: "notification.created";
      workspaceId: string;
      userId: string;
      notificationId: string;
    };

// Survives dev-server hot reloads, which would otherwise orphan subscribers.
const globalForBus = globalThis as unknown as { ticketflowBus?: EventEmitter };

const bus =
  globalForBus.ticketflowBus ??
  (() => {
    const e = new EventEmitter();
    // One listener per connected browser tab; the default cap of 10 is far too low.
    e.setMaxListeners(0);
    globalForBus.ticketflowBus = e;
    return e;
  })();

export function publish(event: AppEvent): void {
  bus.emit("event", event);
}

export function subscribe(listener: (event: AppEvent) => void): () => void {
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
  };
}
