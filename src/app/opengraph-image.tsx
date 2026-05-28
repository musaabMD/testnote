import { ImageResponse } from "next/og";
import { APP_LOGO_URL, APP_NAME } from "@/lib/site-branding";

export const alt = `${APP_NAME} — AI study workspace`;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            fontSize: 48,
            fontWeight: 800,
          }}
        >
          <img
            alt={`${APP_NAME} logo`}
            height={88}
            src={APP_LOGO_URL}
            style={{ borderRadius: 20 }}
            width={88}
          />
          {APP_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ maxWidth: 900, fontSize: 76, fontWeight: 900, lineHeight: 1 }}>
            Upload notes. Get quizzes, summaries, and study sessions.
          </div>
          <div style={{ maxWidth: 760, color: "#475569", fontSize: 32, lineHeight: 1.35 }}>
            AI study tools grounded in your uploaded source files.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
