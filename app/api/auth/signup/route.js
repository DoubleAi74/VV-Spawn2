import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import { toBaseSlug, uniqueUsernameTag } from '@/lib/data';
import { BCRYPT_COST, passwordProblem } from '@/lib/password';
import {
  RATE_LIMITS,
  TOO_MANY_REQUESTS_MESSAGE,
  checkRateLimits,
  clientIp,
} from '@/lib/rateLimit';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password, usernameTitle } = body;

  if (!email || !password || !usernameTitle) {
    return NextResponse.json(
      { error: 'Email, password, and display name are required' },
      { status: 400 }
    );
  }

  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const limited = await checkRateLimits([
    { action: 'signup-ip', identifier: clientIp(request), ...RATE_LIMITS.signupPerIp },
  ]);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: TOO_MANY_REQUESTS_MESSAGE },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    );
  }

  await connectDB();

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const baseTag = toBaseSlug(usernameTitle);
  const usernameTag = await uniqueUsernameTag(baseTag || 'user');

  const user = await User.create({
    email: email.toLowerCase().trim(),
    passwordHash,
    usernameTitle: usernameTitle.trim(),
    usernameTag,
  });

  return NextResponse.json({
    userId: user._id.toString(),
    usernameTag: user.usernameTag,
    usernameTitle: user.usernameTitle,
    email: user.email,
  });
}
