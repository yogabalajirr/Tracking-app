import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { ALLOWED_MIME_TYPES } from "./constants";

/**
 * Attachment storage. Local disk by default so the app runs with no cloud
 * account; S3 when configured.
 *
 * Every write goes through `validateAttachment` first — size ceiling and a
 * mime-type allowlist, per the security constraints.
 */

export type StoredFile = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
};

export class AttachmentRejected extends Error {}

export function validateAttachment(input: {
  filename: string;
  mimeType: string;
  size: number;
}): void {
  const maxBytes = env().MAX_ATTACHMENT_MB * 1024 * 1024;

  if (input.size > maxBytes) {
    throw new AttachmentRejected(
      `"${input.filename}" is ${(input.size / 1024 / 1024).toFixed(1)} MB — the limit is ${env().MAX_ATTACHMENT_MB} MB.`,
    );
  }

  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new AttachmentRejected(
      `"${input.filename}" is a ${mime || "unknown"} file, which isn't allowed.`,
    );
  }
}

/** Strips directory components and anything that could escape the store. */
export function safeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^\w.\- ]+/g, "_");
  return base.slice(0, 180) || "attachment";
}

export async function storeAttachment(input: {
  workspaceId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}): Promise<StoredFile> {
  const filename = safeFilename(input.filename);
  const mimeType = input.mimeType.split(";")[0].trim().toLowerCase();

  validateAttachment({ filename, mimeType, size: input.content.byteLength });

  const key = `${input.workspaceId}/${crypto.randomUUID()}-${filename}`;

  if (env().STORAGE_DRIVER === "s3") {
    return storeToS3(key, input.content, mimeType, filename);
  }

  const root = path.resolve(env().STORAGE_PATH);
  const target = path.join(root, key);

  // Defence in depth: refuse anything that resolved outside the store.
  if (!target.startsWith(root + path.sep)) {
    throw new AttachmentRejected("Invalid attachment path.");
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, input.content);

  return {
    url: `/api/attachments/${key}`,
    filename,
    mimeType,
    size: input.content.byteLength,
  };
}

/** Reads a locally stored attachment back, guarding against traversal. */
export async function readLocalAttachment(
  key: string,
): Promise<{ content: Buffer; mimeType: string } | null> {
  const root = path.resolve(env().STORAGE_PATH);
  const target = path.resolve(root, key);

  if (!target.startsWith(root + path.sep)) return null;

  try {
    const content = await fs.readFile(target);
    return { content, mimeType: "application/octet-stream" };
  } catch {
    return null;
  }
}

async function storeToS3(
  key: string,
  content: Buffer,
  mimeType: string,
  filename: string,
): Promise<StoredFile> {
  const cfg = env();
  if (!cfg.S3_BUCKET || !cfg.S3_REGION) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION.");
  }

  // Imported lazily so the AWS SDK is only needed by S3 deployments.
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT || undefined,
    credentials:
      cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: cfg.S3_ACCESS_KEY_ID,
            secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.S3_BUCKET,
      Key: key,
      Body: content,
      ContentType: mimeType,
    }),
  );

  const base = cfg.S3_ENDPOINT
    ? `${cfg.S3_ENDPOINT.replace(/\/$/, "")}/${cfg.S3_BUCKET}`
    : `https://${cfg.S3_BUCKET}.s3.${cfg.S3_REGION}.amazonaws.com`;

  return { url: `${base}/${key}`, filename, mimeType, size: content.byteLength };
}
