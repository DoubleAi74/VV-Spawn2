import { NextResponse } from "next/server";
import { getUserByUsernameTag } from "@/lib/data";

export async function GET(request, { params }) {
  const { usernameTag } = await params;
  const user = await getUserByUsernameTag(usernameTag);

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    dashHex: user.dashboard?.dashHex || "#2d3e50",
    backHex: user.dashboard?.backHex || "#e5e7eb",
  });
}
