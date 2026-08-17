"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * components/Modal.js — the shell every modal shares.
 *
 * Five modals each carried their own copy of the body-scroll lock and the
 * Escape handler, and none of them trapped focus, restored it on close, or
 * announced itself as a dialog: tabbing walked straight out into the page
 * behind the backdrop, and closing left focus on <body>.
 *
 * The modals keep their own backdrop and panel classes — this owns behaviour,
 * not appearance.
 */

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
    restoreBodyStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0 && restoreBodyStyle) {
    document.body.style.overflow = restoreBodyStyle.overflow;
    document.body.style.paddingRight = restoreBodyStyle.paddingRight;
    restoreBodyStyle = null;
  }
}

export default function Modal({
  onClose,
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
      className={backdropClassName}
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
        className={`${className} focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
