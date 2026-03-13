import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import VerificationToken from '@/lib/models/VerificationToken';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  providers: [
    // Standard email + password login
    Credentials({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();
        const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        }).lean();

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          usernameTag: user.usernameTag,
          usernameTitle: user.usernameTitle,
        };
      },
    }),

    // Magic link completion: validates a short-lived handshake token
    Credentials({
      id: 'magic',
      name: 'Magic Link',
      credentials: {
        handshakeToken: { label: 'Handshake Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.handshakeToken) return null;

        await connectDB();

        const record = await VerificationToken.findOne({
          token: credentials.handshakeToken,
          used: false,
        }).lean();

        if (!record || new Date() > record.expiresAt) return null;

        // Mark token as used (single-use)
        await VerificationToken.findByIdAndUpdate(record._id, { used: true });

        const user = await User.findOne({ email: record.email }).lean();
        if (!user) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          usernameTag: user.usernameTag,
          usernameTitle: user.usernameTitle,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.usernameTag = user.usernameTag;
        token.usernameTitle = user.usernameTitle;
      }
      // Allow updating the session (e.g. after usernameTag change)
      if (trigger === 'update' && session) {
        if (session.usernameTag) token.usernameTag = session.usernameTag;
        if (session.usernameTitle) token.usernameTitle = session.usernameTitle;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.userId = token.userId;
      session.user.usernameTag = token.usernameTag;
      session.user.usernameTitle = token.usernameTitle;
      return session;
    },
  },
});
