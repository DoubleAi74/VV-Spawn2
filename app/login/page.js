"use client";

import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLoadingCard, AuthShell } from "./AuthChrome";

const ERROR_MESSAGES = {
  "missing-token": "Magic link is invalid.",
  "invalid-token": "Magic link is invalid or has already been used.",
  "expired-token": "Magic link has expired. Please request a new one.",
  "user-not-found": "No account found for this email.",
  CredentialsSignin: "Incorrect email or password.",
};

const inputClassName =
  "block w-full rounded-sm px-4 py-3 bg-zinc-900/50 text-white placeholder:text-zinc-600 ring-1 ring-white/10 outline-none focus:ring-white/40 [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_rgb(24,24,27)] [&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:caret-white";

export default function LoginPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showForgot, setShowForgot] = useState(false);
  const [showMagicForm, setShowMagicForm] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [magicSent, setMagicSent] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  const mode = searchParams.get("mode");
  const urlError = searchParams.get("error");
  const magicToken = searchParams.get("magic");
  const resetToken = searchParams.get("reset");
  const isSigningUp = mode === "signup";

  // Pre-warm the DB connection while the user is typing
  useEffect(() => {
    fetch("/api/auth/session");
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.usernameTag) {
      router.replace(`/${session.user.usernameTag}`);
    }
  }, [status, session, router]);

  useEffect(() => {
    if (!magicToken) return;

    setLoading(true);

    signIn("magic", { handshakeToken: magicToken, redirect: false })
      .then((res) => {
        if (res?.error) {
          setError("Magic link is invalid or has expired.");
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      });
  }, [magicToken]);

  useEffect(() => {
    if (!resetToken) return;

    setShowResetForm(true);
    setShowForgot(false);
    setShowMagicForm(false);
  }, [resetToken]);

  useEffect(() => {
    if (resetToken) return;

    setShowForgot(false);
    setShowMagicForm(false);
    setForgotSent(false);
    setMagicSent(false);
    setError("");
  }, [isSigningUp, resetToken]);

  const errorMsg = useMemo(
    () =>
      error ||
      (urlError ? ERROR_MESSAGES[urlError] || "An error occurred." : ""),
    [error, urlError],
  );

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });

    if (res?.error) {
      setLoading(false);
      setError(ERROR_MESSAGES.CredentialsSignin);
    }
    // On success: leave loading=true → full-screen spinner shows until session redirect fires
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    setError("");

    if (!loginEmail.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setMagicLoading(true);

    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail }),
    });

    setMagicLoading(false);

    if (res.ok) {
      setMagicSent(true);
      return;
    }

    setError("Failed to send magic link. Please try again.");
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: signupEmail,
        password: signupPassword,
        usernameTitle: signupName,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Signup failed. Please try again.");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", {
      email: signupEmail,
      password: signupPassword,
      redirect: false,
    });

    setLoading(false);

    if (signInRes?.error) {
      setError("Account created. Please log in.");
      router.replace("/login");
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail }),
    });

    setLoading(false);
    setForgotSent(true);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: resetPassword }),
    });

    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Reset failed. Please try again.");
      return;
    }

    setResetDone(true);
    setShowResetForm(false);
  }

  if (status === "loading" || loading || (magicToken && loading)) {
    return <AuthLoadingCard mode={isSigningUp ? "signup" : "login"} />;
  }

  const compactShell = showResetForm || showForgot || showMagicForm;

  return (
    <AuthShell compact={compactShell}>
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Volvox Works
        </h1>
        <p className="mt-5 mb-6 text-zinc-300">
          {showResetForm
            ? "Set your new password"
            : showForgot
              ? "Recover your account access"
              : showMagicForm
                ? "Use a secure sign-in link"
                : isSigningUp
                  ? "Create your profile to start collecting"
                  : "Welcome back to your collection"}
        </p>
      </div>

      {resetDone && (
        <div className="mb-4 text-center text-xs uppercase tracking-wide text-green-400">
          Password updated. You can now log in.
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 text-center text-xs uppercase tracking-wide text-red-400"
        >
          {errorMsg}
        </div>
      )}

      {showResetForm && resetToken ? (
        <form onSubmit={handleResetPassword} className="space-y-5">
          <input
            id="reset-pw"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="New password"
            className={inputClassName}
          />

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-sm py-3 text-sm font-semibold transition-all ${
              loading
                ? "cursor-not-allowed bg-zinc-300/60 text-neutral-700"
                : "bg-zinc-300 text-neutral-700 hover:bg-zinc-400 active:scale-[0.98] active:brightness-90"
            }`}
          >
            {loading ? "Saving…" : "Set new password"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowResetForm(false);
              setError("");
            }}
            className="w-full text-xs text-zinc-500 hover:text-zinc-300"
          >
            Back to login
          </button>
        </form>
      ) : showMagicForm && !isSigningUp ? (
        <div>
          {magicSent ? (
            <p className="text-sm text-zinc-300">
              Check your inbox. A sign-in link is on its way.
            </p>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-5">
              <input
                id="magic-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="Email address"
                className={inputClassName}
              />

              <button
                type="submit"
                disabled={magicLoading}
                className={`w-full rounded-sm py-3 text-sm font-semibold transition-all ${
                  magicLoading
                    ? "cursor-not-allowed bg-zinc-300/60 text-neutral-700"
                    : "bg-zinc-300 text-neutral-700 hover:bg-zinc-400 active:scale-[0.98] active:brightness-90"
                }`}
              >
                {magicLoading ? "Sending…" : "Send email link"}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setShowMagicForm(false);
              setMagicSent(false);
              setError("");
            }}
            className="mt-4 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Back to login
          </button>
        </div>
      ) : showForgot && !isSigningUp ? (
        <div>
          {forgotSent ? (
            <p className="text-sm text-zinc-300">
              If an account exists for that email, a reset link has been sent.
            </p>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="Email address"
                className={inputClassName}
              />

              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-sm py-3 text-sm font-semibold transition-all ${
                  loading
                    ? "cursor-not-allowed bg-zinc-300/60 text-neutral-700"
                    : "bg-zinc-300 text-neutral-700 hover:bg-zinc-400 active:scale-[0.98] active:brightness-90"
                }`}
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => {
              setShowForgot(false);
              setForgotSent(false);
              setError("");
            }}
            className="mt-4 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Back to login
          </button>
        </div>
      ) : !isSigningUp ? (
        <form onSubmit={handlePasswordLogin}>
          <div className="space-y-5">
            <input
              id="login-email"
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Email address"
              className={inputClassName}
            />

            <input
              id="login-pw"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Password"
              className={inputClassName}
            />

            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-sm py-3 text-sm font-semibold transition-all ${
                loading
                  ? "cursor-not-allowed bg-zinc-300/60 text-neutral-700"
                  : "bg-zinc-300 text-neutral-700 hover:bg-zinc-400 active:scale-[0.98] active:brightness-90"
              }`}
            >
              {loading ? "Logging in…" : "Log In"}
            </button>
          </div>

          <div className="mt-2.5 text-center text-xs text-zinc-500">or</div>

          <button
            type="button"
            onClick={() => {
              setShowMagicForm(true);
              setMagicSent(false);
              setError("");
            }}
            disabled={loading}
            className={`mt-2.5 w-full rounded-sm py-2 text-[13px] font-medium transition-all ${
              loading
                ? "cursor-not-allowed bg-zinc-900/35 text-zinc-500"
                : "bg-zinc-800/55 text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700/75"
            }`}
          >
            Sign in with an email link
          </button>

          <div className="mt-5 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setShowForgot(true);
                setError("");
              }}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Password reset
            </button>

            <NextLink
              href="/login?mode=signup"
              className="text-zinc-500 hover:text-zinc-300"
            >
              Sign up
            </NextLink>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSignup} className="space-y-5">
          <input
            id="signup-name"
            type="text"
            value={signupName}
            onChange={(e) => setSignupName(e.target.value)}
            required
            maxLength={100}
            autoComplete="name"
            placeholder="Full Name (e.g. Adam Aldridge)"
            className={inputClassName}
          />

          <input
            id="signup-email"
            type="email"
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="Email address"
            className={inputClassName}
          />

          <input
            id="signup-pw"
            type="password"
            value={signupPassword}
            onChange={(e) => setSignupPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Password"
            className={inputClassName}
          />

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-sm py-3 text-sm font-semibold transition-all ${
              loading
                ? "cursor-not-allowed bg-zinc-300/60 text-neutral-700"
                : "bg-zinc-300 text-neutral-700 hover:bg-zinc-400 active:scale-[0.98] active:brightness-90"
            }`}
          >
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>
      )}

      {isSigningUp && (
        <div className="mt-8 text-center">
          <NextLink
            href="/login"
            className="block text-xs text-zinc-500 hover:text-zinc-300"
          >
            Already have an account? Log In
          </NextLink>
        </div>
      )}
    </AuthShell>
  );
}
