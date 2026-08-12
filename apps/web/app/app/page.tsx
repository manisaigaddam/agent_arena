import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Arena from "@/components/Arena";

export default async function AppPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <Arena />;
}
