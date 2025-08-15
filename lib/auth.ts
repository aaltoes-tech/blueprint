import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import type { Adapter } from "next-auth/adapters"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session?.user) {
        session.user.id = user.id
        session.user.role = user.role as string
        // Update last login time
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: "database",
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      // Log user sign-in event
      console.log(`User ${user.email} signed in with ${account?.provider}`)
    },
  },
}