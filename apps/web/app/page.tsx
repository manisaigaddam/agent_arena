import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Landing from "@/components/Landing";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/app");
  return <Landing />;
}
