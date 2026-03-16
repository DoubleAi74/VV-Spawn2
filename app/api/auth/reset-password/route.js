import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import PasswordResetToken from '@/lib/models/PasswordResetToken';
import { buildAuthEmail } from '@/lib/authEmailTemplate';
import { Resend } from 'resend';

const TOKEN_TTL_MINUTES = 60;

// POST /api/auth/reset-password — request a password reset email
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
  // Don't reveal whether the email exists
  if (!user) {
    return NextResponse.json({ success: true });
  }

  // Delete any existing unused tokens for this email
  await PasswordResetToken.deleteMany({ email: email.toLowerCase().trim(), used: false });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await PasswordResetToken.create({
    email: email.toLowerCase().trim(),
    token,
    expiresAt,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
  const APP_URL = process.env.NEXTAUTH_URL;
  const resetUrl = `${APP_URL}/login?reset=${token}`;
  const { html, text } = buildAuthEmail({
    preheader: 'Reset your Volvox Works password.',
    title: 'Reset your password',
    message:
      'We received a request to reset the password for your Volvox Works account. Use the button below to choose a new password.',
    actionLabel: 'Reset Password',
    actionUrl: resetUrl,
    actionHint: 'This reset link works once and takes you straight to the password form.',
    expiryLabel: `This link expires in ${TOKEN_TTL_MINUTES} minutes.`,
    footer: "If you didn't request this, you can safely ignore this email.",
  });

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'Reset your volvox.works password',
    html,
    text,
  });

  return NextResponse.json({ success: true });
}

// PATCH /api/auth/reset-password — confirm reset with new password
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { token, password } = body;

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  await connectDB();

  const record = await PasswordResetToken.findOne({ token, used: false }).lean();

  if (!record) {
    return NextResponse.json({ error: 'Invalid or already-used reset link' }, { status: 400 });
  }

  if (new Date() > record.expiresAt) {
    await PasswordResetToken.findByIdAndDelete(record._id);
    return NextResponse.json({ error: 'Reset link has expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await User.findOneAndUpdate(
    { email: record.email },
    { $set: { passwordHash } }
  );

  // Mark token as used (single-use)
  await PasswordResetToken.findByIdAndUpdate(record._id, { used: true });

  return NextResponse.json({ success: true });
}
