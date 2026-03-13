import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import User from '@/lib/models/User';
import { toBaseSlug, uniqueUsernameTag } from '@/lib/data';

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

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    );
  }

  await connectDB();

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
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
