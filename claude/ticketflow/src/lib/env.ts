import { z } from "zod";

/**
 * Server-side environment. Parsed once, lazily, so that importing this module
 * from a client component (which would have no `process.env`) fails loudly
 * instead of silently yielding `undefined` secrets.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_SECRET: z
    .string()
    .min(16, "APP_SECRET must be at least 16 characters — generate with `openssl rand -hex 32`"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  EMAIL_PROVIDER: z.enum(["console", "resend", "postmark", "smtp"]).default("console"),
  EMAIL_DOMAIN: z.string().default("ticketflow.local"),
  INBOUND_WEBHOOK_SECRET: z.string().min(1).default("dev-inbound-secret"),

  RESEND_API_KEY: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_PATH: z.string().default("./storage/attachments"),
  MAX_ATTACHMENT_MB: z.coerce.number().positive().default(10),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),

  SENTRY_DSN: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Empty strings in `.env` should behave as "unset", not as a provided value. */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
}

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${detail}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** True when AI features should be offered in the UI. */
export function aiEnabled(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

/** The inbound support address for a workspace, e.g. `support@agent.ticketflow.local`. */
export function supportAddress(subdomain: string): string {
  return `support@${subdomain}.${env().EMAIL_DOMAIN}`;
}
