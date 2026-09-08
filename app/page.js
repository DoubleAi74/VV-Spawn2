import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/data";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await auth();

  if (session?.user?.userId) {
    // Prefer the live Mongo tag. The JWT can still hold a pre-rename slug,
    // which would send a logged-in visitor to a dead URL and trap /login.
    const user = await getUserById(session.user.userId);
    const tag = user?.usernameTag || session.user.usernameTag;
    if (tag) redirect(`/${tag}`);
  }

  redirect("/login");
}
