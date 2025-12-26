"use client";

export const dynamic = "force-dynamic";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        <h1>Something went wrong</h1>
        <p>{error.message}</p>

        <button
          onClick={reset}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}