"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MODAL_EXIT_MS, prefersReducedMotion } from "@/lib/motion";

/**
 * components/Modal.js — the shell every modal shares.
 *
 * Five modals each carried their own copy of the body-scroll lock and the
 * Escape handler, and none of them trapped focus, restored it on close, or
 * announced itself as a dialog: tabbing walked straight out into the page
 * behind the backdrop, and closing left focus on <body>.
 *
 * The modals keep their own backdrop and panel classes — this owns behaviour,
 * not appearance. The enter and exit animation lives in `.modal-backdrop` and
 * `.modal-panel` in app/globals.css, applied here so it is written once.
 */

/**
 * Holds the modal on screen for the length of its exit animation.
 *
 * The parent unmounts the modal, so the modal cannot animate its own exit
 * without deferring that unmount. Each modal therefore closes through
 * `requestClose` instead of calling its `onClose` prop directly — including
 * from Modal's own Escape and backdrop handlers, which receive `requestClose`
 * as their `onClose`.
 *
 * Opening is not deferred: the enter animation runs on an already-interactive
 * modal.
 */
export function useModalExit(onClose) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef(null);

  const requestClose = useCallback(() => {
    // A second Escape, or a click on a control while the exit is running.
    if (timerRef.current) return;

    if (prefersReducedMotion()) {
      onClose?.();
      return;
    }

    setIsClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onClose?.();
    }, MODAL_EXIT_MS);
  }, [onClose]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { isClosing, requestClose };
}

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// One lock shared by every open modal. Two modals can overlap for a commit
// while one replaces another, and the first to unmount must not unlock the page
// underneath the second.
let openModalCount = 0;
let restoreBodyStyle = null;

function lockBodyScroll() {
  if (openModalCount === 0) {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const scrollY = window.scrollY;
    restoreBodyStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      scrollY,
    };
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0 && restoreBodyStyle) {
    const { scrollY } = restoreBodyStyle;
    document.body.style.overflow = restoreBodyStyle.overflow;
    document.body.style.paddingRight = restoreBodyStyle.paddingRight;
    document.body.style.position = restoreBodyStyle.position;
    document.body.style.top = restoreBodyStyle.top;
    document.body.style.left = restoreBodyStyle.left;
    document.body.style.right = restoreBodyStyle.right;
    document.body.style.width = restoreBodyStyle.width;
    restoreBodyStyle = null;
    window.scrollTo(0, scrollY);
  }
}

export default function Modal({
  onClose,
  isClosing = false,
  backdropClassName,
  className,
  labelledBy,
  ariaLabel,
  closeOnBackdrop = true,
  onKeyDown,
  children,
}) {
  const panelRef = useRef(null);
  // A drag that starts inside the panel and finishes on the backdrop is a text
  // selection, not a dismissal.
  const backdropPressRef = useRef(false);

  useEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  // Focus moves into the panel itself rather than its first field, so opening a
  // modal does not put a focus ring on a control the user did not choose.
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleTrap = useCallback(
    (event) => {
      onKeyDown?.(event);
      if (event.key !== "Tab" || event.defaultPrevented) return;

      const panel = panelRef.current;
      if (!panel) return;

      // Read the focusable set on every Tab: modal content changes as files are
      // picked, tabs are switched and the rich text editor mounts.
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [onKeyDown],
  );

  return (
    <div
      className={`${backdropClassName} modal-backdrop`}
      data-closing={isClosing ? "true" : undefined}
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (!closeOnBackdrop) return;
        if (event.target !== event.currentTarget) return;
        if (!backdropPressRef.current) return;
        backdropPressRef.current = false;
        onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDown={handleTrap}
        data-closing={isClosing ? "true" : undefined}
        className={`${className} modal-panel focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
