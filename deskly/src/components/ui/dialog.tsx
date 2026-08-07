"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/**
 * Modal dialog with focus trapping and Escape-to-close.
 *
 * Hand-rolled rather than pulled from Radix because the app needs exactly one
 * dialog shape, and this keeps the focus behaviour explicit and auditable.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    // Move focus into the dialog, and stop the page behind it scrolling.
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([aria-label="Close"])',
      );
      (target ?? panelRef.current)?.focus();
    }, 0);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "w-full rounded-xl border border-border bg-card p-5 shadow-xl",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-xl",
          size === "lg" && "max-w-3xl",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        {children}
      </div>
    </div>
  );
}
