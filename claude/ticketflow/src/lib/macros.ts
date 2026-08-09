/**
 * Canned-response variables.
 *
 * Supported placeholders — `{{customer_name}}`, `{{ticket_id}}`,
 * `{{agent_name}}`, `{{company_name}}` — are substituted when a macro is
 * inserted, so what the agent sees in the composer is exactly what the
 * customer will receive. Unknown placeholders are left untouched rather than
 * blanked, which makes a typo obvious instead of silently dropping text.
 */

export const MACRO_VARIABLES = [
  { key: "customer_name", label: "Customer name" },
  { key: "ticket_id", label: "Ticket number" },
  { key: "agent_name", label: "Your name" },
  { key: "company_name", label: "Workspace name" },
] as const;

export type MacroVariables = {
  customer_name?: string;
  ticket_id?: string;
  agent_name?: string;
  company_name?: string;
};

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function applyVariables(body: string, values: MacroVariables): string {
  return body.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name.toLowerCase() as keyof MacroVariables];
    return value === undefined || value === "" ? match : value;
  });
}

/** Placeholders present in a macro body — used to preview a macro in settings. */
export function usedVariables(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1].toLowerCase()))];
}
