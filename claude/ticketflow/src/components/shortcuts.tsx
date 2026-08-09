"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Global keyboard shortcuts.
 *
 * Handlers register themselves with `useShortcut`, so a page only owns the keys
 * it can actually service. Anything typed inside an input, textarea or
 * contenteditable is ignored unless the shortcut opts in via `allowInInput`
 * (which is how Cmd+Enter can send a reply from within the editor).
 */

type Handler = (event: KeyboardEvent) => void;
type Registration = { handler: Handler; allowInInput: boolean };

const ShortcutContext = React.createContext<{
  register: (combo: string, reg: Registration) => () => void;
} | null>(null);

/** Normalises an event into a comparable string like "mod+enter" or "shift+/". */
function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function ShortcutProvider({
  children,
  onShowHelp,
}: {
  children: React.ReactNode;
  onShowHelp: () => void;
}) {
  // combo -> stack of registrations; the most recently mounted wins, so a
  // ticket detail view can shadow the inbox's binding for the same key.
  const registry = React.useRef(new Map<string, Registration[]>());

  const register = React.useCallback((combo: string, reg: Registration) => {
    const map = registry.current;
    const stack = map.get(combo) ?? [];
    stack.push(reg);
    map.set(combo, stack);

    return () => {
      const current = map.get(combo);
      if (!current) return;
      const idx = current.lastIndexOf(reg);
      if (idx >= 0) current.splice(idx, 1);
      if (current.length === 0) map.delete(combo);
    };
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const combo = comboFromEvent(e);

      if (combo === "shift+?" || combo === "?") {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        onShowHelp();
        return;
      }

      const stack = registry.current.get(combo);
      if (!stack || stack.length === 0) return;

      const active = stack[stack.length - 1];
      if (isTypingTarget(e.target) && !active.allowInInput) return;

      e.preventDefault();
      active.handler(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onShowHelp]);

  return (
    <ShortcutContext.Provider value={{ register }}>{children}</ShortcutContext.Provider>
  );
}

export function useShortcut(
  combo: string | null,
  handler: Handler,
  opts: { allowInInput?: boolean; enabled?: boolean } = {},
) {
  const ctx = React.useContext(ShortcutContext);
  const { allowInInput = false, enabled = true } = opts;

  // Keep the latest closure without re-registering on every render.
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });

  React.useEffect(() => {
    if (!ctx || !combo || !enabled) return;
    return ctx.register(combo, {
      handler: (e) => handlerRef.current(e),
      allowInInput,
    });
  }, [ctx, combo, enabled, allowInInput]);
}

export const SHORTCUTS: { keys: string; description: string; group: string }[] = [
  { keys: "J", description: "Next ticket", group: "Inbox" },
  { keys: "K", description: "Previous ticket", group: "Inbox" },
  { keys: "Enter", description: "Open selected ticket", group: "Inbox" },
  { keys: "/", description: "Focus search", group: "Inbox" },
  { keys: "R", description: "Reply to customer", group: "Ticket" },
  { keys: "N", description: "Add internal note", group: "Ticket" },
  { keys: "A", description: "Assign ticket", group: "Ticket" },
  { keys: "#", description: "Add a tag", group: "Ticket" },
  { keys: "E", description: "Resolve ticket", group: "Ticket" },
  { keys: "⌘ / Ctrl + Enter", description: "Send reply or note", group: "Composer" },
  { keys: "/", description: "Insert canned response", group: "Composer" },
  { keys: "Esc", description: "Close dialog or cancel", group: "Global" },
  { keys: "?", description: "Show this help", group: "Global" },
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg scroll-slim"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <ul className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li
                    key={`${group}-${s.keys}-${s.description}`}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">{s.description}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
