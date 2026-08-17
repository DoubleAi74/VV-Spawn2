"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme, useThemeSync } from "@/context/ThemeContext";
import { mutationFailureDetail, useToast } from "@/context/ToastContext";
import { mergeServerAndOptimistic } from "@/lib/optimisticMerge";
import { reorderItemsByIndex, swapItemsByIds } from "@/lib/ordering";
import { useQueue } from "@/lib/useQueue";
import { useFlipReorder } from "@/lib/useFlipReorder";
import { REORDER_DEBOUNCE_MS } from "@/lib/motion";
import { focusRingOn } from "@/lib/colour";
import { setDashboardSnapshot } from "@/lib/routeTransitionCache";
import DashHeader from "@/components/dashboard/DashHeader";
import PageCard from "@/components/dashboard/PageCard";
import DashboardInfoEditor from "@/components/dashboard/DashboardInfoEditor";
import CreatePageModal from "@/components/dashboard/CreatePageModal";
import EditPageModal from "@/components/dashboard/EditPageModal";

export default function DashboardViewClient({ user, initialPages }) {
  const { user: sessionUser } = useAuth();
  const { dashHex, backHex } = useTheme();
  const router = useRouter();
  const scrollRestorePosRef = useRef(null);
  const refreshWithScrollRestore = useCallback(() => {
    if (typeof window === "undefined") return;
    // Offline, the RSC refresh fails and the App Router falls back to a full
    // browser navigation — which lands on the browser's offline page and takes
    // the failure message with it. Nothing has changed on the server anyway.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    scrollRestorePosRef.current = window.scrollY;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    router.refresh();
  }, [router]);
  const handleQueueIdle = useCallback(async () => {
    refreshWithScrollRestore();
  }, [refreshWithScrollRestore]);
  const { showError } = useToast();
  // A rolled-back change the user was not told about is indistinguishable
  // from losing their work.
  const handleQueueError = useCallback(
    (error, op) => {
      showError(
        op?.description || "Something didn't save.",
        mutationFailureDetail({ rolledBack: op?.rollsBackLocally !== false }),
      );
    },
    [showError],
  );
  const { enqueue, isSyncing } = useQueue(handleQueueIdle, handleQueueError);

  const isOwner = sessionUser?.usernameTag === user.usernameTag;
  const [isEditMode, setIsEditMode] = useState(false);
  // The theme poll only has anything to report while its own colours can be
  // changed, which is the owner in edit mode and nobody else.
  useThemeSync(isOwner && isEditMode);
  const [pages, setPages] = useState(initialPages);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const prefetchedRoutesRef = useRef(new Set());

  useEffect(() => {
    setPages((currentPages) =>
      mergeServerAndOptimistic(initialPages, currentPages),
    );

    if (scrollRestorePosRef.current === null) return;

    const savedY = scrollRestorePosRef.current;
    scrollRestorePosRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: "instant" });
        if ("scrollRestoration" in window.history) {
          window.history.scrollRestoration = "auto";
        }
      });
    });
  }, [initialPages]);

  // ── Info text ──
  async function handleSaveInfo(infoText) {
    const res = await fetch("/api/user/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infoText }),
    });
    // The editor reports a rejected save in its own status line. Without this
    // check a failed request still read as "Saved".
    if (!res.ok) throw new Error("Failed to save dashboard info");
    // Hand back what was actually stored so the preview shows exactly that.
    const stored = await res.json().catch(() => ({}));
    return typeof stored.infoText === "string" ? stored.infoText : infoText;
  }

  // ── Create page ──
  const handleCreatePage = useCallback(
    async (data) => {
      const tempId = `_opt_${Date.now()}`;
      const optimistic = {
        ...data,
        _id: tempId,
        _optimistic: true,
        order_index: pages.length + 1,
      };
      setPages((prev) => [...prev, optimistic]);

      enqueue({
        type: "create",
        description: "Couldn't create your new page",
        fn: async () => {
          const res = await fetch("/api/pages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Failed to create page");
          const created = await res.json();
          setPages((prev) => prev.map((p) => (p._id === tempId ? created : p)));
        },
        onRollback: () => {
          setPages((prev) => prev.filter((p) => p._id !== tempId));
        },
      });
    },
    [pages.length, enqueue],
  );

  // ── Edit page ──
  async function handleEditPage(data) {
    if (!editingPage) return;

    const pageId = editingPage._id;
    const previousPages = pages;
    const nextOrderIndex = data.order_index ?? editingPage.order_index ?? 1;

    setPages((currentPages) =>
      reorderItemsByIndex(currentPages, pageId, nextOrderIndex, data),
    );
    setEditingPage(null);

    enqueue({
      type: "update",
      description: "Couldn't save your changes to that page",
      fn: async () => {
        const res = await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update page");
        const updated = await res.json();
        setPages((currentPages) =>
          reorderItemsByIndex(
            currentPages,
            pageId,
            updated.order_index ?? nextOrderIndex,
            updated,
          ),
        );
      },
      onRollback: () => {
        setPages(previousPages);
      },
    });
  }

  // ── Delete page ──
  function handleDeletePage(page) {
    // if (
    //   !confirm(
    //     `Delete "${page.title}"? This will also delete all its posts and files.`,
    //   )
    // )
    // return;
    setPages((prev) => prev.filter((p) => p._id !== page._id));

    enqueue({
      type: "delete",
      description: `Couldn't delete "${page.title || "that page"}"`,
      fn: async () => {
        const res = await fetch(`/api/pages/${page._id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete page");
      },
      onRollback: () => {
        setPages((prev) => {
          const next = [...prev, page];
          return next.sort((a, b) => a.order_index - b.order_index);
        });
      },
    });
  }

  // ── Reorder ──
  // Swap array positions AND renumber order_index together. Moving one without
  // the other lets the rendered order drift from the stored order, which is
  // what allowed duplicate indices to build up.
  //
  // Every click bumps the sequence number and rewrites the pending target; the
  // request itself is debounced, so a four-place burst is one write of the
  // final absolute index rather than four serial writes of intermediate ones.
  //
  // The sequence number must be bumped at *click* time, not when the debounce
  // fires. Bumping it at flush time would leave a window in which a response
  // from an earlier burst is still the newest sequence and gets applied over
  // state that already reflects later clicks — which is exactly the stagger
  // this guard exists to prevent.
  const reorderSeqRef = useRef(0);
  const pendingReorderRef = useRef(null);
  const reorderTimerRef = useRef(null);
  const [isReorderPending, setIsReorderPending] = useState(false);
  const gridRef = useRef(null);
  const flip = useFlipReorder(gridRef);

  const sendReorder = useCallback(async ({ pageId, toIndex }) => {
    const res = await fetch("/api/pages/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, toIndex }),
    });
    if (!res.ok) throw new Error("Failed to reorder pages");
    return res.json();
  }, []);

  const flushPendingReorder = useCallback(() => {
    reorderTimerRef.current = null;
    const pending = pendingReorderRef.current;
    pendingReorderRef.current = null;
    if (!pending) {
      setIsReorderPending(false);
      return;
    }

    enqueue({
      type: "update",
      description: "Couldn't save the new page order",
      // The rollback resyncs from the server rather than restoring a snapshot.
      rollsBackLocally: false,
      fn: async () => {
        // Guard before the request as well as after it. Between this op being
        // queued and it reaching the front, another click may have scheduled a
        // newer one — sending this would write an order nobody is looking at.
        if (pending.seq !== reorderSeqRef.current) return;

        const { ordering } = await sendReorder(pending);

        // And again on the way back: superseded by a later click, whose own
        // response will settle the order.
        if (pending.seq !== reorderSeqRef.current || !Array.isArray(ordering)) return;

        const indexById = new Map(
          ordering.map((entry) => [entry._id, entry.order_index]),
        );
        setPages((currentPages) =>
          [...currentPages]
            .map((p) =>
              indexById.has(p._id)
                ? { ...p, order_index: indexById.get(p._id) }
                : p,
            )
            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
        );
      },
      // Ordering is server-authoritative, so resync rather than restoring a
      // snapshot that later clicks in the same burst have already invalidated.
      onRollback: () => {
        refreshWithScrollRestore();
      },
    });

    // enqueue has already set the queue's own syncing flag in this same tick,
    // so the indicator does not blink between the two.
    setIsReorderPending(false);
  }, [enqueue, refreshWithScrollRestore, sendReorder]);

  // A move made in the last 300ms before navigating away is still a move.
  useEffect(
    () => () => {
      if (!reorderTimerRef.current) return;
      clearTimeout(reorderTimerRef.current);
      const pending = pendingReorderRef.current;
      pendingReorderRef.current = null;
      if (!pending) return;
      fetch("/api/pages/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: pending.pageId, toIndex: pending.toIndex }),
        keepalive: true,
      }).catch(() => {});
    },
    [],
  );

  function moveByOffset(page, offset) {
    const idx = pages.findIndex((p) => p._id === page._id);
    const targetIdx = idx + offset;
    if (idx === -1 || targetIdx < 0 || targetIdx >= pages.length) return;

    const other = pages[targetIdx];
    if (page._optimistic || other._optimistic) return;

    // Where the cards are now, before React moves them.
    flip.capture();

    // flushSync so a rapid second click reads the result of this one. Without
    // it React may not have committed yet, both clicks compute the same move,
    // and the duplicate cancels the first out.
    flushSync(() => {
      setPages(swapItemsByIds(pages, page._id, other._id));
    });

    // Where they are now — and the animation back from where they were.
    flip.play();

    pendingReorderRef.current = {
      pageId: page._id,
      toIndex: targetIdx + 1,
      seq: ++reorderSeqRef.current,
    };
    setIsReorderPending(true);

    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(flushPendingReorder, REORDER_DEBOUNCE_MS);
  }

  function handleMoveUp(page) {
    moveByOffset(page, -1);
  }

  function handleMoveDown(page) {
    moveByOffset(page, 1);
  }

  const visiblePages = isOwner ? pages : pages.filter((p) => !p.isPrivate);

  const prefetchRoute = useCallback(
    (href) => {
      if (!href) return;
      if (prefetchedRoutesRef.current.has(href)) return;
      prefetchedRoutesRef.current.add(href);
      router.prefetch(href);
    },
    [router],
  );

  useEffect(() => {
    if (!user?.usernameTag) return;

    setDashboardSnapshot(user.usernameTag, {
      usernameTitle: user.usernameTitle || "",
      email: user.email || "",
      dashHex,
      backHex,
      pages: visiblePages.slice(0, 20).map((page) => ({
        _id: page._id,
        title: page.title || "",
        thumbnail: page.thumbnail || "",
        blurDataURL: page.blurDataURL || "",
      })),
    });
  }, [
    user?.usernameTag,
    user?.usernameTitle,
    user?.email,
    dashHex,
    backHex,
    visiblePages,
  ]);

  useEffect(() => {
    if (!user?.usernameTag) return;
    const warmRoutes = visiblePages
      .slice(0, 3)
      .map((page) => `/${user.usernameTag}/${page.slug}`);
    warmRoutes.forEach(prefetchRoute);
  }, [visiblePages, user?.usernameTag, prefetchRoute]);

  useEffect(() => {
    document.documentElement.style.backgroundColor = dashHex;
    return () => {
      document.documentElement.style.backgroundColor = "";
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, [dashHex]);

  return (
    <div
      // min-h-[150vh] forced one and a half screens of empty background even
      // for a user with two pages, so a new account's first action was
      // scrolling through nothing. See LNK-5.
      className="min-h-screen overscroll-none"
      style={{
        backgroundColor: backHex,
        "--focus-ring": focusRingOn(backHex),
      }}
    >
      <div
        className="sticky top-0 left-0 right-0 z-50"
        style={{ backgroundColor: backHex }}
      >
        <DashHeader
          usernameTitle={user.usernameTitle}
          usernameTag={user.usernameTag}
          email={user.email}
          isOwner={isOwner}
          isEditMode={isEditMode}
          statusText={isSyncing || isReorderPending ? "Saving..." : ""}
          onToggleEdit={() => setIsEditMode((m) => !m)}
          onTitleSave={(newTag) => router.replace(`/${newTag}`)}
        />
      </div>

      <main className="w-full px-[10px] md:px-8 pt-[1.8rem] pb-72">
        {visiblePages.length === 0 && !isEditMode && (
          <p className="text-neutral-500 text-center py-12">No pages yet.</p>
        )}

        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4"
        >
          {visiblePages.map((page, idx) => (
            <PageCard
              key={page._id}
              page={page}
              isOwner={isOwner}
              isEditMode={isEditMode}
              onClick={() => router.push(`/${user.usernameTag}/${page.slug}`)}
              onPrefetch={() =>
                prefetchRoute(`/${user.usernameTag}/${page.slug}`)
              }
              onEdit={setEditingPage}
              onDelete={handleDeletePage}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              isFirst={idx === 0}
              isLast={idx === visiblePages.length - 1}
              // The first row is above the fold on every breakpoint (2 columns
              // on phones, 4 on desktop), so it must not be lazy-loaded.
              priority={idx < 4}
            />
          ))}
        </div>

        {(isOwner && isEditMode) ||
        (user.dashboard?.infoText &&
          user.dashboard.infoText !== "<p><br></p>") ? (
          <div className="mt-6">
            <DashboardInfoEditor
              initialText={user.dashboard?.infoText || ""}
              isEditMode={isOwner && isEditMode}
              onSave={handleSaveInfo}
            />
          </div>
        ) : null}
      </main>

      {isOwner && isEditMode && (
        // <nav
        //   className="fixed bottom-0 left-0 right-0 z-40 flex justify-end gap-3 px-4 sm:px-6 py-4 bg-neutral-900/75 backdrop-blur-[5px] border-t border-white/10"
        //   aria-label="Page actions"
        // >
        //   <button
        //     type="button"
        //     onClick={() => setShowCreate(true)}
        //     className="flex items-center gap-2 px-4 py-2.5 rounded-[3px] bg-neutral-100/90 text-neutral-900 font-semibold hover:bg-neutral-100 active:bg-neutral-100/80 transition-all duration-100 shadow-lg shadow-white/10"
        //   >
        //     <Plus size={16} />
        //     New Page
        //   </button>
        // </nav>
        <nav
          className="fixed bottom-0 right-0 z-40 flex justify-end gap-3 px-4 sm:px-6 py-3 bg-neutral-900/50 backdrop-blur-[5px] border-t border-white/10"
          aria-label="Page actions"
          style={{
            width: "30vw",
            minWidth: "280px",
            clipPath: "polygon(36.8% 0%, 100% 0%, 100% 100%, 0% 100%)",
          }}
        >
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[3px] bg-neutral-100/90 text-neutral-900 font-semibold hover:bg-neutral-100 active:bg-neutral-100/80 transition-all duration-100 shadow-lg shadow-white/10"
          >
            <Plus size={16} />
            New Page
          </button>
        </nav>
      )}

      {showCreate && (
        <CreatePageModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreatePage}
        />
      )}
      {editingPage && (
        <EditPageModal
          page={editingPage}
          itemCount={pages.length}
          onClose={() => setEditingPage(null)}
          onSave={handleEditPage}
        />
      )}
    </div>
  );
}
