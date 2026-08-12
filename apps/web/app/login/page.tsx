import { redirect } from "next/navigation";

/** Old /login → branded homepage magic link */
export default function LoginRedirect() {
  redirect("/");
}
