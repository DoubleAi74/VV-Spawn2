import { NextResponse } from 'next/server';
import { handlers } from '@/lib/auth';
import {
  RATE_LIMITS,
  TOO_MANY_REQUESTS_MESSAGE,
  checkRateLimits,
  clientIp,
} from '@/lib/rateLimit';

export const { GET } = handlers;

// Only the provider callbacks carry a credential guess. The rest of the
// Auth.js surface — session, csrf, providers — must not be throttled, or an
// ordinary tab would lock itself out.
function isCredentialAttempt(request) {
  return new URL(request.url).pathname.includes('/callback/');
}

export async function POST(request) {
  if (isCredentialAttempt(request)) {
    const limited = await checkRateLimits([
      { action: 'login-ip', identifier: clientIp(request), ...RATE_LIMITS.loginPerIp },
    ]);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: TOO_MANY_REQUESTS_MESSAGE, code: 'rate-limited' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
      );
    }
  }

  return handlers.POST(request);
}
