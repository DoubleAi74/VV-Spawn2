const baseCardClassName =
  "relative w-full overflow-hidden rounded-md border border-white/5 bg-black/60 px-14 py-10 shadow-2xl backdrop-blur-[1px]";

function AuthHeader({ mode }) {
  return (
    <div className="text-center">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
        Volvox Works
      </h1>
      <p className="mt-5 mb-6 text-zinc-300">
        {mode === "signup"
          ? "Create your profile to start collecting"
          : "Welcome back to your collection"}
      </p>
    </div>
  );
}

function LoginGhost() {
  return (
    <>
      <div className="space-y-5">
        <div className="block w-full rounded-sm px-4 py-3 border border-transparent">
          &nbsp;
        </div>
        <div className="block w-full rounded-sm px-4 py-3 border border-transparent">
          &nbsp;
        </div>
        <div className="w-full rounded-sm py-3 text-sm font-semibold">
          &nbsp;
        </div>
      </div>

      <div className="mt-2.5 w-full text-center text-xs py-[3px]">or</div>

      <div className="mt-2.5 block w-full rounded-sm py-2 border border-transparent">
        &nbsp;
      </div>

      <div className="mt-5 flex items-center justify-between text-xs py-[3px]">
        <span>password reset</span>
        <span>Sign Up</span>
      </div>
    </>
  );
}

function SignupGhost() {
  return (
    <>
      <div className="space-y-5">
        <div className="block w-full rounded-sm px-4 py-3 border border-transparent">
          &nbsp;
        </div>
        <div className="block w-full rounded-sm px-4 py-3 border border-transparent">
          &nbsp;
        </div>
        <div className="block w-full rounded-sm px-4 py-3 border border-transparent">
          &nbsp;
        </div>
        <div className="w-full rounded-sm py-3 text-sm font-semibold">
          &nbsp;
        </div>
      </div>

      <div className="mt-8 text-center">
        <span className="block text-xs text-zinc-500">
          Already have an account? Log In
        </span>
      </div>
    </>
  );
}

export function AuthShell({ children, compact = false }) {
  const cardClassName = compact
    ? baseCardClassName
    : `${baseCardClassName} h-[29rem]`;
  const slotClassName = compact ? "h-[29rem] pt-[4.25rem]" : "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-black font-sans text-white">
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center md:hidden"
          style={{ backgroundImage: "url('/background-800.webp')" }}
        />
        <div
          className="absolute inset-0 hidden bg-cover bg-center md:block"
          style={{ backgroundImage: "url('/background-1920.webp')" }}
        />
        <div className="absolute inset-0 pointer-events-none bg-black/30" />
      </div>

      <div className="relative z-10 flex min-h-[100svh] flex-col items-center justify-start px-4 pt-[14svh] md:min-h-screen md:justify-center md:pt-0">
        <div className="w-full max-w-lg">
          <div className={slotClassName}>
            <div className={cardClassName}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLoadingCard({ mode = "login" }) {
  const isSignup = mode === "signup";

  return (
    <AuthShell>
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
      </div>

      <div className="invisible opacity-0 select-none" aria-hidden="true">
        <AuthHeader mode={mode} />
        {isSignup ? <SignupGhost /> : <LoginGhost />}
      </div>
    </AuthShell>
  );
}
