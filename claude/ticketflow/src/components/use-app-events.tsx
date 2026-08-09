"use client";

import * as React from "react";

/**
 * Shared Server-Sent Events connection.
 *
 * Every consumer attaches to one `EventSource` so a browser tab holds a single
 * stream regardless of how many components listen. The connection is opened on
 * first subscribe and torn down when the last listener unmounts.
 */

type Listener = (payload: unknown) => void;

let source: EventSource | null = null;
let refCount = 0;
const listeners = new Map<string, Set<Listener>>();

const EVENT_TYPES = [
  "ticket.created",
  "ticket.updated",
  "message.created",
  "notification.created",
] as const;

export type AppEventType = (typeof EVENT_TYPES)[number];

function ensureConnection() {
  if (source) return;

  source = new EventSource("/api/events");

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (event) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return;
      }
      listeners.get(type)?.forEach((fn) => fn(payload));
    });
  }

  // EventSource reconnects on its own; drop the handle so a later subscribe
  // does not reuse a permanently failed connection.
  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      if (refCount > 0) ensureConnection();
    }
  };
}

function closeConnection() {
  source?.close();
  source = null;
}

export function useAppEvents(type: AppEventType, handler: (payload: unknown) => void) {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });

  React.useEffect(() => {
    const listener: Listener = (payload) => handlerRef.current(payload);

    const set = listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(type, set);

    refCount++;
    ensureConnection();

    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(type);
      refCount--;
      if (refCount === 0) closeConnection();
    };
  }, [type]);
}
