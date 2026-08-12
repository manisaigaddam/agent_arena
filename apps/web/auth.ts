import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyMagicToken } from "@/lib/magic";

/**
 * Auth.js — magic-link only for the browser control plane.
 * Agents use per-sandbox MCP `?token=` — never this session.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "magic-link",
      name: "Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const token = String(credentials?.token || "");
        if (!token) return null;
        try {
          const email = await verifyMagicToken(token);
          return {
            id: email,
            email,
            name: email.split("@")[0],
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.email = (token.email as string) || session.user.email;
      }
      return session;
    },
  },
  trustHost: true,
});
