import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** The app has no marketing site — send people where they can act. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/inbox" : "/login");
}
