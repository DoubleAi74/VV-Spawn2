"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";

/**
 * ToastContext — the app's only channel for telling someone that something
 * failed.
 *
 * Every optimistic mutation rolls its state back when the request fails. A
 * silent rollback is indistinguishable from data loss: the post appears, then
 * vanishes, and nothing explains why. Anything that rolls back must say so
 * here.
 */

const ToastContext = createContext(null);

const DISMISS_AFTER = { error: 8000, info: 4000 };

// A missing provider must never take a mutation down with it. Without one the
// work still happens; it just goes unannounced.
const NO_PROVIDER = {
  showToast: () => {},
  showError: () => {},
  dismissToast: () => {},
};

export function useToast() {
  return useContext(ToastContext) || NO_PROVIDER;
}

/**
 * The second line of a failed-mutation toast: what happened to their work.
 * Offline is worth naming, because it is the common case and it tells the user
 * the fix is theirs to make.
 *
 * `rolledBack: false` is for operations that resync from the server instead of
 * restoring a local snapshot — reordering. Offline there is no server to resync
 * from, so the screen keeps showing the move that was never saved, and saying
 * "the change has been undone" would be untrue.
 */
export function mutationFailureDetail({ rolledBack = true } = {}) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (offline) {
    return rolledBack
      ? "You appear to be offline — the change has been undone."
      : "You appear to be offline — nothing was saved. Reload to see the saved order.";
  }

  return rolledBack
    ? "The change has been undone. Please try again."
    : "The saved order has been restored.";
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismissToast = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message, { tone = "info", detail = "" } = {}) => {
      if (!message) return null;
      const id = ++nextId.current;

      setToasts((current) => [...current, { id, tone, message, detail }]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), DISMISS_AFTER[tone] || DISMISS_AFTER.info)
      );

      return id;
    },
    [dismissToast]
  );

  const showError = useCallback(
    (message, detail) => showToast(message, { tone: "error", detail }),
    [showToast]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ showToast, showError, dismissToast }),
    [showToast, showError, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    // pointer-events-none on the stack so it never blocks the page behind it;
    // each toast re-enables them for its own dismiss button.
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const isError = toast.tone === "error";

  return (
    <div
      // Errors interrupt; everything else waits its turn. Neither takes focus.
      role={isError ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-[3px] border px-4 py-3 shadow-lg backdrop-blur-[5px] ${
        isError
          ? "border-red-400/30 bg-red-950/85 text-red-50"
          : "border-white/15 bg-neutral-900/85 text-neutral-100"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{toast.message}</p>
        {toast.detail ? (
          <p className="mt-1 text-xs leading-snug opacity-70">{toast.detail}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 -mt-1 shrink-0 rounded-[3px] p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
