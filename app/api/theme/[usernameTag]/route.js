import { NextResponse } from "next/server";
import { getUserTheme } from "@/lib/data";

export async function GET(request, { params }) {
  const { usernameTag } = await params;
  const theme = await getUserTheme(usernameTag);

  if (!theme) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      dashHex: theme.dashboard?.dashHex || "#2d3e50",
      backHex: theme.dashboard?.backHex || "#e5e7eb",
    },
    {
      headers: {
        // Two public hex strings. The owner's own edit-mode poll sends
        // `no-store` because it needs to see its own writes immediately; this
        // is for everything else, including any CDN in front of the app.
        "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}
