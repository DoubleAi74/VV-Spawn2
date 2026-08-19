"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme, useThemeSync } from "@/context/ThemeContext";
import { mutationFailureDetail, useToast } from "@/context/ToastContext";
import { mergeServerAndOptimistic } from "@/lib/optimisticMerge";
import { normalizeOrderIndexes, swapItemsByIds } from "@/lib/ordering";
import {
  applyEditFromServer,
  applyEditLocally,
  restoreDeletedItem,
  rollbackItemSnapshot,
  shouldMergeServerList,
} from "@/lib/listMutation";
import {
  capturePendingScroll,
  takePendingScroll,
} from "@/lib/preserveScroll";
import { useQueue } from "@/lib/useQueue";
import { focusRingOn } from "@/lib/colour";
import {
  getDashboardSnapshot,
  getPageSnapshot,
  setDashboardSnapshot,
  setPageSnapshot,
} from "@/lib/routeTransitionCache";
import { writeUpTarget } from "@/lib/upNavigation";
import { normalizeInfoMode } from "@/lib/infoMode";
import DashHeader from "@/components/dashboard/DashHeader";
import PageCard from "@/components/dashboard/PageCard";
import DashboardInfoEditor from "@/components/dashboard/DashboardInfoEditor";
import CreatePageModal from "@/components/dashboard/CreatePageModal";
import EditPageModal from "@/components/dashboard/EditPageModal";
import EmptyAddButton from "@/components/EmptyAddButton";
import { hasVisibleInfo } from "@/components/page/PageInfoView";

function readSessionDraft(key, fallback) {
  if (typeof window === "undefined" || !key) return fallback;
  try {
    const draft = window.sessionStorage.getItem(key);
    return draft == null ? fallback : draft;
  } catch {
    return fallback;
  }
}

function readSessionMode(key, savedMode, text) {
  const serverMode = normalizeInfoMode(savedMode, text);
  if (typeof window === "undefined" || !key) return serverMode;
  try {
    return normalizeInfoMode(window.sessionStorage.getItem(key), text);
  } catch {
    return serverMode;
  }
}

function writeSession(key, value) {
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export default function DashboardViewClient({
  user,
  initialPages,
  isOwner: serverIsOwner = false,
}) {
  const { user: sessionUser } = useAuth();
  const { dashHex, backHex } = useTheme();
  const router = useRouter();
  const listGenerationRef = useRef(0);
  const refreshGenerationRef = useRef(null);
  const bumpListGeneration = useCallback(() => {
    listGenerationRef.current += 1;
    return listGenerationRef.current;
  }, []);
  const refreshWithScrollRestore = useCallback(() => {
    if (typeof window === "undefined") return;
    // Offline, the RSC refresh fails and the App Router falls back to a full
    // browser navigation — which lands on the browser's offline page and takes
    // the failure message with it. Nothing has changed on the server anyway.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    refreshGenerationRef.current = listGenerationRef.current;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    capturePendingScroll(listGenerationRef.current);
    router.refresh();
  }, [router]);
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
  const { enqueue, isSyncing } = useQueue(undefined, handleQueueError);

  // The server already knows — waiting on useSession is what left the header
  // without email/Edit until the client caught up.
  const isOwner =
    serverIsOwner || sessionUser?.usernameTag === user.usernameTag;
  const [isEditMode, setIsEditMode] = useState(false);
  // Local copy: a first save used to write the API but never this prop, so
  // leaving edit mode unmounted the editor (parent still saw empty infoText).
  const infoStorageKey = user.usernameTag
    ? `volvox:dashInfo:${user.usernameTag}`
    : "";
  const infoModeKey = user.usernameTag
    ? `volvox:dashInfoMode:${user.usernameTag}`
    : "";
  const infoStorageKey1 = user.usernameTag
    ? `volvox:dashInfo1:${user.usernameTag}`
    : "";
  const infoModeKey1 = user.usernameTag
    ? `volvox:dashInfoMode1:${user.usernameTag}`
    : "";
  const [infoText, setInfoText] = useState(() =>
    readSessionDraft(infoStorageKey, user.dashboard?.infoText || ""),
  );
  const [infoMode, setInfoMode] = useState(() =>
    readSessionMode(
      infoModeKey,
      user.dashboard?.infoMode,
      user.dashboard?.infoText || "",
    ),
  );
  const [infoText1, setInfoText1] = useState(() =>
    readSessionDraft(infoStorageKey1, user.dashboard?.infoText1 || ""),
  );
  const [infoMode1, setInfoMode1] = useState(() =>
    readSessionMode(
      infoModeKey1,
      user.dashboard?.infoMode1,
      user.dashboard?.infoText1 || "",
    ),
  );
  // The theme poll only has anything to report while its own colours can be
  // changed, which is the owner in edit mode and nobody else.
  useThemeSync(isOwner && isEditMode);
  const [pages, setPages] = useState(initialPages);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const prefetchedRoutesRef = useRef(new Set());

  useLayoutEffect(() => {
    if (
      shouldMergeServerList(
        refreshGenerationRef.current,
        listGenerationRef.current,
      )
    ) {
      setPages((currentPages) =>
        mergeServerAndOptimistic(initialPages, currentPages),
      );
    }

    const savedY = takePendingScroll(listGenerationRef.current);
    if (savedY == null) return;
    window.scrollTo({ top: savedY, behavior: "instant" });
  }, [initialPages]);

  const persistInfoDraft = useCallback(
    (next) => {
      setInfoText(next);
      writeSession(infoStorageKey, next);
    },
    [infoStorageKey],
  );

  const persistInfoMode = useCallback(
    (next) => {
      setInfoMode(next);
      writeSession(infoModeKey, next);
    },
    [infoModeKey],
  );

  const persistInfoDraft1 = useCallback(
    (next) => {
      setInfoText1(next);
      writeSession(infoStorageKey1, next);
    },
    [infoStorageKey1],
  );

  const persistInfoMode1 = useCallback(
    (next) => {
      setInfoMode1(next);
      writeSession(infoModeKey1, next);
    },
    [infoModeKey1],
  );

  // ── Info text ──
  async function handleSaveInfo(slot, nextInfoText, nextInfoMode) {
    const payload = {
      infoText,
      infoMode,
      infoText1,
      infoMode1,
    };
    if (slot === "above") {
      payload.infoText1 = nextInfoText;
      payload.infoMode1 = nextInfoMode;
    } else {
      payload.infoText = nextInfoText;
      payload.infoMode = nextInfoMode;
    }

    const res = await fetch("/api/user/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save dashboard info");
    const stored = await res.json().catch(() => ({}));
    const clean =
      typeof stored.infoText === "string" ? stored.infoText : payload.infoText;
    const clean1 =
      typeof stored.infoText1 === "string" ? stored.infoText1 : payload.infoText1;
    const cleanMode = normalizeInfoMode(stored.infoMode, clean);
    const cleanMode1 = normalizeInfoMode(stored.infoMode1, clean1);

    setInfoText((current) => {
      if (slot === "below" && current !== nextInfoText) return current;
      writeSession(infoStorageKey, clean);
      return clean;
    });
    setInfoText1((current) => {
      if (slot === "above" && current !== nextInfoText) return current;
      writeSession(infoStorageKey1, clean1);
      return clean1;
    });
    persistInfoMode(cleanMode);
    persistInfoMode1(cleanMode1);

    if (slot === "above") return { infoText: clean1, infoMode: cleanMode1 };
    return { infoText: clean, infoMode: cleanMode };
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
      bumpListGeneration();
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
    [pages.length, enqueue, bumpListGeneration],
  );

  // ── Edit page ──
  async function handleEditPage(data) {
    if (!editingPage) return;

    const pageId = editingPage._id;
    const snapshot = { ...editingPage };
    const allowReorder = data.order_index !== undefined;
    const editGeneration = bumpListGeneration();

    setPages((currentPages) => applyEditLocally(currentPages, pageId, data));
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
          applyEditFromServer(currentPages, pageId, updated, {
            allowReorder,
            editGeneration,
            currentGeneration: listGenerationRef.current,
          }),
        );
      },
      onRollback: () => {
        setPages((currentPages) =>
          rollbackItemSnapshot(currentPages, pageId, snapshot),
        );
      },
    });
  }

  // ── Delete page ──
  function handleDeletePage(page) {
    bumpListGeneration();
    setPages((prev) =>
      normalizeOrderIndexes(prev.filter((p) => p._id !== page._id)),
    );

    enqueue({
      type: "delete",
      description: `Couldn't delete "${page.title || "that page"}"`,
      fn: async () => {
        const res = await fetch(`/api/pages/${page._id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete page");
      },
      onRollback: () => {
        setPages((prev) => restoreDeletedItem(prev, page));
      },
    });
  }

  // ── Reorder ──
  // Swap array positions AND renumber order_index together. Moving one without
  // the other lets the rendered order drift from the stored order, which is
  // what allowed duplicate indices to build up.
  //
  // One request per click, deliberately. Coalescing a burst behind a debounce
  // needs a pending slot per item; a single shared slot silently drops the
  // earlier item's move when two different cards are moved in quick
  // succession, and sends the later one's index computed against an
  // arrangement the server never received. Per-click requests are chattier and
  // correct. The optimistic swap is the UI; the response body is not applied.
  function moveByOffset(page, offset) {
    const idx = pages.findIndex((p) => p._id === page._id);
    const targetIdx = idx + offset;
    if (idx === -1 || targetIdx < 0 || targetIdx >= pages.length) return;

    const other = pages[targetIdx];
    if (page._optimistic || other._optimistic) return;

    // flushSync so a rapid second click reads the result of this one. Without
    // it React may not have committed yet, both clicks compute the same move,
    // and the duplicate cancels the first out.
    bumpListGeneration();
    flushSync(() => {
      setPages(swapItemsByIds(pages, page._id, other._id));
    });

    const toIndex = targetIdx + 1;

    enqueue({
      type: "update",
      description: "Couldn't save the new page order",
      // The rollback resyncs from the server rather than restoring a snapshot.
      rollsBackLocally: false,
      fn: async () => {
        const res = await fetch("/api/pages/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: page._id, toIndex }),
        });
        if (!res.ok) throw new Error("Failed to reorder pages");
        await res.json().catch(() => ({}));
      },
      onRollback: () => {
        refreshWithScrollRestore();
      },
    });
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

  const infoHeight1Ref = useRef(
    getDashboardSnapshot(user.usernameTag)?.infoHeight1,
  );
  const infoHeightRef = useRef(
    getDashboardSnapshot(user.usernameTag)?.infoHeight,
  );

  const writeDashboardSnapshot = useCallback(() => {
    if (!user?.usernameTag) return;
    setDashboardSnapshot(user.usernameTag, {
      usernameTitle: user.usernameTitle || "",
      email: user.email || "",
      isOwner,
      dashHex,
      backHex,
      infoText1,
      infoMode1,
      infoHeight1: infoHeight1Ref.current,
      infoText,
      infoMode,
      infoHeight: infoHeightRef.current,
      pages: visiblePages.slice(0, 20).map((page) => ({
        _id: page._id,
        title: page.title || "",
        thumbnail: page.thumbnail || "",
        blurDataURL: page.blurDataURL || "",
        slug: page.slug || "",
      })),
    });
  }, [
    user?.usernameTag,
    user?.usernameTitle,
    user?.email,
    isOwner,
    dashHex,
    backHex,
    infoText1,
    infoMode1,
    infoText,
    infoMode,
    visiblePages,
  ]);

  useEffect(() => {
    writeDashboardSnapshot();
  }, [writeDashboardSnapshot]);

  const handleAboveHeight = useCallback(
    (height) => {
      if (!Number.isFinite(height) || height <= 0) return;
      if (infoHeight1Ref.current === height) return;
      infoHeight1Ref.current = height;
      writeDashboardSnapshot();
    },
    [writeDashboardSnapshot],
  );

  const handleBelowHeight = useCallback(
    (height) => {
      if (!Number.isFinite(height) || height <= 0) return;
      if (infoHeightRef.current === height) return;
      infoHeightRef.current = height;
      writeDashboardSnapshot();
    },
    [writeDashboardSnapshot],
  );

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
    };
  }, [dashHex]);

  return (
    <div
      // min-h-[150vh] forced one and a half screens of empty background even
      // for a user with two pages, so a new account's first action was
      // scrolling through nothing. See LNK-5.
      className="min-h-screen overscroll-none flex flex-col"
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
          statusText={isSyncing ? "Saving..." : ""}
          onToggleEdit={() => setIsEditMode((m) => !m)}
          onTitleSave={(newTag) => router.replace(`/${newTag}`)}
        />
      </div>

      <main
        className={`w-full flex-1 flex flex-col px-[10px] md:px-8 pb-72 ${
          (isOwner && isEditMode) || hasVisibleInfo(infoText1)
            ? "pt-[1.8rem]"
            : "pt-[calc(1.8rem*1.53)]"
        }`}
      >
        {(isOwner && isEditMode) || hasVisibleInfo(infoText1) ? (
          <div className="mb-6 shrink-0">
            <DashboardInfoEditor
              value={infoText1}
              mode={infoMode1}
              isEditMode={isOwner && isEditMode}
              onChange={persistInfoDraft1}
              onModeChange={persistInfoMode1}
              onSave={(text, mode) => handleSaveInfo("above", text, mode)}
              initialHeight={infoHeight1Ref.current}
              onHeight={handleAboveHeight}
            />
          </div>
        ) : null}

        {visiblePages.length === 0 && isOwner && isEditMode ? (
          <div className="flex items-center justify-center min-h-[10.35rem]">
            <EmptyAddButton
              label="New page"
              onClick={() => setShowCreate(true)}
            />
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4"
          >
            {visiblePages.map((page, idx) => (
              <PageCard
                key={page._id}
                page={page}
                isOwner={isOwner}
                isEditMode={isEditMode}
                href={page.slug ? `/${user.usernameTag}/${page.slug}` : undefined}
                onNavigate={() => {
                  const existing = getPageSnapshot(user.usernameTag, page.slug);
                  const infoText1 =
                    existing && "infoText1" in existing
                      ? existing.infoText1
                      : page.pageMetaData?.infoText1 || "";
                  setPageSnapshot(user.usernameTag, page.slug, {
                    pageTitle: page.title || existing?.pageTitle || "",
                    userEmail: user.email || existing?.userEmail || "",
                    isOwner,
                    dashHex,
                    backHex,
                    infoText1,
                    infoMode1: normalizeInfoMode(
                      existing?.infoMode1 ?? page.pageMetaData?.infoMode1,
                      infoText1,
                    ),
                    infoHeight1: existing?.infoHeight1,
                    posts: existing?.posts?.length ? existing.posts : [],
                  });
                  writeUpTarget(`/${user.usernameTag}`);
                }}
                onOpen={() => {
                  if (!page.slug) return;
                  router.push(`/${user.usernameTag}/${page.slug}`);
                }}
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
        )}

        {(isOwner && isEditMode) || hasVisibleInfo(infoText) ? (
          <div className="mt-6 shrink-0">
            <DashboardInfoEditor
              value={infoText}
              mode={infoMode}
              isEditMode={isOwner && isEditMode}
              onChange={persistInfoDraft}
              initialHeight={infoHeightRef.current}
              onHeight={handleBelowHeight}
              onModeChange={persistInfoMode}
              onSave={(text, mode) => handleSaveInfo("below", text, mode)}
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
