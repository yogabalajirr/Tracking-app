"use client";

import * as React from "react";
import { AtSign, Lock, Send, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useShortcut } from "@/components/shortcuts";
import { applyVariables } from "@/lib/macros";
import type { TicketDetail } from "@/lib/ticket-detail";
import type { WorkspaceMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "./ticket-detail";

type Mode = "reply" | "note";

/** The word currently under the caret, used to drive the `/` and `@` pickers. */
function activeToken(value: string, caret: number): { token: string; start: number } {
  const before = value.slice(0, caret);
  const match = /(^|\s)([/@][^\s]*)$/.exec(before);
  if (!match) return { token: "", start: caret };
  return { token: match[2], start: caret - match[2].length };
}

export const Composer = React.forwardRef<
  HTMLTextAreaElement,
  {
    ticket: TicketDetail;
    meta: WorkspaceMeta;
    currentUser: CurrentUser;
    mode: Mode;
    onModeChange: (mode: Mode) => void;
    aiEnabled: boolean;
    onSent: () => void | Promise<void>;
  }
>(function Composer({ ticket, meta, currentUser, mode, onModeChange, aiEnabled, onSent }, ref) {
  const [value, setValue] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [caret, setCaret] = React.useState(0);
  const [pickerIndex, setPickerIndex] = React.useState(0);

  const innerRef = React.useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const { token, start } = activeToken(value, caret);
  const showMacros = mode === "reply" && token.startsWith("/");
  const showMentions = mode === "note" && token.startsWith("@");

  const macroMatches = React.useMemo(() => {
    if (!showMacros) return [];
    const q = token.slice(1).toLowerCase();
    return meta.cannedResponses
      .filter((c) => c.shortcode.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [showMacros, token, meta.cannedResponses]);

  const mentionMatches = React.useMemo(() => {
    if (!showMentions) return [];
    const q = token.slice(1).toLowerCase();
    return meta.agents
      .filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [showMentions, token, meta.agents]);

  const pickerOpen = macroMatches.length > 0 || mentionMatches.length > 0;
  const pickerLength = macroMatches.length || mentionMatches.length;

  // A new token means a new list — highlight its first entry immediately,
  // not one render later.
  const [pickerToken, setPickerToken] = React.useState(token);
  if (pickerToken !== token) {
    setPickerToken(token);
    setPickerIndex(0);
  }

  function replaceToken(replacement: string) {
    const next = `${value.slice(0, start)}${replacement}${value.slice(caret)}`;
    setValue(next);
    // Put the caret straight after what we inserted.
    requestAnimationFrame(() => {
      const pos = start + replacement.length;
      innerRef.current?.setSelectionRange(pos, pos);
      innerRef.current?.focus();
      setCaret(pos);
    });
  }

  function insertMacro(macro: WorkspaceMeta["cannedResponses"][number]) {
    replaceToken(
      applyVariables(macro.body, {
        customer_name: ticket.customer.name ?? ticket.customer.email,
        ticket_id: `#${ticket.number}`,
        agent_name: currentUser.name,
        company_name: meta.workspace.name,
      }),
    );
  }

  async function send() {
    const body = value.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, isInternal: mode === "note" }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Couldn't send that.");
        return;
      }

      setValue("");
      toast.success(mode === "note" ? "Note added." : "Reply sent.");
      await onSent();
    } catch {
      toast.error("Network error — your text is still here, try again.");
    } finally {
      setSending(false);
    }
  }

  async function suggestReply() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't draft a reply.");
      }

      // Stream the draft in so the agent sees it appear rather than waiting.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setValue("");

      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        setValue((prev) => prev + decoder.decode(chunk, { stream: true }));
      }

      innerRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't draft a reply.");
    } finally {
      setSuggesting(false);
    }
  }

  useShortcut("mod+enter", () => void send(), { allowInInput: true });

  return (
    <div className="shrink-0 border-t border-border">
      <div className="flex items-center gap-1 px-3 pt-2">
        <ModeTab active={mode === "reply"} onClick={() => onModeChange("reply")}>
          <Send className="size-3.5" /> Reply
        </ModeTab>
        <ModeTab active={mode === "note"} onClick={() => onModeChange("note")}>
          <Lock className="size-3.5" /> Internal note
        </ModeTab>

        {aiEnabled && mode === "reply" && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            loading={suggesting}
            onClick={() => void suggestReply()}
          >
            <Sparkles /> Suggest reply
          </Button>
        )}
      </div>

      <div className="relative p-3 pt-2">
        {pickerOpen && (
          <ul
            role="listbox"
            aria-label={showMacros ? "Canned responses" : "Mention a teammate"}
            className="absolute bottom-full left-3 right-3 z-20 mb-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg scroll-slim"
          >
            {macroMatches.map((macro, i) => (
              <li key={macro.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === pickerIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMacro(macro);
                  }}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm",
                    i === pickerIndex ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <Zap className="size-3.5 shrink-0 text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">/{macro.shortcode}</span>
                  <span className="truncate">{macro.title}</span>
                </button>
              </li>
            ))}

            {mentionMatches.map((agent, i) => (
              <li key={agent.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === pickerIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    replaceToken(`@${agent.email} `);
                  }}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm",
                    i === pickerIndex ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <AtSign className="size-3.5 shrink-0 text-primary" />
                  <span>{agent.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{agent.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Textarea
          ref={innerRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (!pickerOpen) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setPickerIndex((i) => (i + 1) % pickerLength);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setPickerIndex((i) => (i - 1 + pickerLength) % pickerLength);
            } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              if (macroMatches[pickerIndex]) insertMacro(macroMatches[pickerIndex]);
              else if (mentionMatches[pickerIndex]) {
                replaceToken(`@${mentionMatches[pickerIndex].email} `);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              setCaret(-1);
            }
          }}
          rows={4}
          aria-label={mode === "note" ? "Internal note" : "Reply to customer"}
          placeholder={
            mode === "note"
              ? "Visible to your team only. Type @ to mention a teammate."
              : "Type your reply. Press / to insert a canned response."
          }
          className={cn(
            "resize-y",
            mode === "note" && "border-note-border bg-note text-note-foreground placeholder:text-note-foreground/60",
          )}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {mode === "note" ? (
              <>
                <Lock className="mr-1 inline size-3" />
                Not sent to the customer.
              </>
            ) : (
              <>Goes to {ticket.customer.email}.</>
            )}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              ⌘↵
            </kbd>
            <Button onClick={() => void send()} loading={sending} disabled={!value.trim()}>
              {mode === "note" ? "Add note" : "Send reply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
