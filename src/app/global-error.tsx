"use client";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "white",
            color: "#0f172a",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <title>Application error | DrNote</title>
          <div style={{ maxWidth: 448, textAlign: "center" }}>
            <p
              style={{
                margin: 0,
                color: "#64748b",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Application error
            </p>
            <h1
              style={{
                margin: "16px 0 0",
                fontSize: 32,
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              DrNote could not render this page.
            </h1>
            <p style={{ margin: "12px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              Retry the page render or return to the dashboard.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                marginTop: 24,
              }}
            >
              <button
                onClick={() => unstable_retry()}
                style={{
                  border: 0,
                  borderRadius: 999,
                  background: "#0f172a",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                  padding: "10px 20px",
                }}
                type="button"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 999,
                  color: "#334155",
                  fontWeight: 700,
                  padding: "10px 20px",
                  textDecoration: "none",
                }}
              >
                Dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
