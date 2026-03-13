import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { buildAuthEmail } from '@/lib/authEmailTemplate';
import User from '@/lib/models/User';
import VerificationToken from '@/lib/models/VerificationToken';
import { Resend } from 'resend';

const TOKEN_TTL_MINUTES = 10;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (!user) {
    // Don't reveal whether the email exists
    return NextResponse.json({ success: true });
  }

  // Delete any existing unused tokens for this email
  await VerificationToken.deleteMany({ email: email.toLowerCase().trim(), used: false });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await VerificationToken.create({
    email: email.toLowerCase().trim(),
    token,
    expiresAt,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
  const APP_URL = process.env.NEXTAUTH_URL;
  const magicLinkUrl = `${APP_URL}/api/auth/magic-link/verify?token=${token}`;
  const { html, text } = buildAuthEmail({
    preheader: 'Use this secure link to sign in to Volvox Works.',
    title: 'Sign in to your collection',
    message:
      'Use the secure link below to sign in to Volvox Works without entering your password.',
    actionLabel: 'Sign In With Magic Link',
    actionUrl: magicLinkUrl,
    actionHint: 'This secure link works once and opens your account directly.',
    expiryLabel: `This link expires in ${TOKEN_TTL_MINUTES} minutes.`,
    footer: "If you didn't request this, you can ignore this email.",
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Sign in to volvox.works',
    html,
    text,
  });

  return NextResponse.json({ success: true });
}
