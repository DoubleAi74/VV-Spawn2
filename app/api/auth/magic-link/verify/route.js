import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import VerificationToken from '@/lib/models/VerificationToken';

const APP_URL = process.env.NEXTAUTH_URL;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing-token', APP_URL));
  }

  await connectDB();

  const record = await VerificationToken.findOne({ token, used: false }).lean();

  if (!record) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', APP_URL));
  }

  if (new Date() > record.expiresAt) {
    await VerificationToken.findByIdAndDelete(record._id);
    return NextResponse.redirect(new URL('/login?error=expired-token', APP_URL));
  }

  const user = await User.findOne({ email: record.email }).lean();
  if (!user) {
    return NextResponse.redirect(new URL('/login?error=user-not-found', APP_URL));
  }

  // Mark original token as used
  await VerificationToken.findByIdAndUpdate(record._id, { used: true });

  // Create a short-lived handshake token (5 min) for the login page to consume
  const handshakeToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await VerificationToken.create({
    email: record.email,
    token: handshakeToken,
    expiresAt,
  });

  // Redirect to login page — the login page will auto sign-in using the handshake token
  return NextResponse.redirect(
    new URL(`/login?magic=${handshakeToken}`, APP_URL)
  );
}
