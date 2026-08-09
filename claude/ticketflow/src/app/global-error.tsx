"use client";

/**
 * Last-resort boundary: this replaces the root layout, so it cannot rely on the
 * app's fonts, providers or theme class — hence the inline styles and the
 * `prefers-color-scheme` media query rather than the usual tokens.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <title>TicketFlow — something went wrong</title>

        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            TicketFlow hit an unexpected error
          </h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.75, margin: "0 0 1rem" }}>
            The app failed to start rendering. Reloading usually clears it.
          </p>

          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                opacity: 0.6,
                margin: "0 0 1rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              fontSize: "0.875rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
