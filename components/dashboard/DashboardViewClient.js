"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme, useThemeSync } from "@/context/ThemeContext";
import { mutationFailureDetail, useToast } from "@/context/ToastContext";
import { normalizeOrderIndexes, swapItemsByIds } from "@/lib/ordering";
import {
  applyEditFromServer,
  applyEditLocally,
  restoreDeletedItem,
  rollbackItemSnapshot,
} from "@/lib/listMutation";
import { useCardList } from "@/lib/useCardList";
import { focusRingOn } from "@/lib/colour";
import { useGridColumns } from "@/lib/useGridColumns";
import {
  getDashboardSnapshot,
  getPageSnapshot,
  setDashboardSnapshot,
  setPageSnapshot,
} from "@/lib/routeTransitionCache";
import { writeUpTarget } from "@/lib/upNavigation";
import { normalizeInfoMode } from "@/lib/infoMode";
import { DASHBOARD_INFO_FIELDS } from "@/lib/infoFields";
import { useInfoSync } from "@/lib/useInfoSync";
import DashHeader from "@/components/dashboard/DashHeader";
import DashboardChrome from "@/components/dashboard/DashboardChrome";
import PageCard from "@/components/dashboard/PageCard";
import DashboardInfoEditor from "@/components/dashboard/DashboardInfoEditor";
import DashboardContent from "@/components/dashboard/DashboardContent";
import CreatePageModal from "@/components/dashboard/CreatePageModal";
import EditPageModal from "@/components/dashboard/EditPageModal";
import EmptyAddButton from "@/components/EmptyAddButton";
import { hasVisibleInfo } from "@/components/page/PageInfoView";

export default function DashboardViewClient({
  user,
  initialPages,
  isOwner: serverIsOwner = false,
}) {
  const { user: sessionUser } = useAuth();
  const { dashHex, backHex } = useTheme();
  const router = useRouter();
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

  // The server already knows — waiting on useSession is what left the header
  // without email/Edit until the client caught up.
  const isOwner =
    serverIsOwner ||
    (sessionUser?.userId && user?.id && sessionUser.userId === user.id) ||
    sessionUser?.usernameTag === user.usernameTag;
  const [isEditMode, setIsEditMode] = useState(false);
  const info = useInfoSync({
    initialValues: user.dashboard,
    initialClientValues: () => {
      const snapshot = getDashboardSnapshot(user.usernameTag);
      // A cached route can still carry the columns from before our last edit.
      // Only seed an owner's own layout; visitor overrides are separate.
      return isOwner && snapshot?.isOwner && Object.hasOwn(snapshot, 'gridCols')
        ? { gridCols: snapshot.gridCols }
        : undefined;
    },
    fields: DASHBOARD_INFO_FIELDS,
    readUrl: `/api/user/dashboard?userId=${encodeURIComponent(user.id)}`,
    writeUrl: "/api/user/dashboard",
    canEdit: isOwner,
    isEditMode: isOwner && isEditMode,
    storageKey: `volvox:infoDraft:dashboard:${user.id}`,
  });
  const { infoText, infoMode, infoText1, infoMode1 } = info.values;
  // The theme poll only has anything to report while its own colours can be
  // changed, which is the owner in edit mode and nobody else.
  useThemeSync(isOwner && isEditMode);
  const {
    items: pages, setItems: setPages, getItems: getCurrentPages,
    enqueue, isSyncing, generationRef: listGenerationRef, refresh: refreshList,
  } = useCardList({
    resourceKey: `dashboard:${user.id}`,
    initialItems: initialPages,
    readUrl: `/api/pages?userId=${encodeURIComponent(user.id)}`,
    usernameTag: user.usernameTag,
    isOwner,
    onError: handleQueueError,
  });
  const bumpListGeneration = useCallback(() => {
    listGenerationRef.current += 1;
    return listGenerationRef.current;
  }, [listGenerationRef]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const prefetchedRoutesRef = useRef(new Set());

  const grid = useGridColumns({
    resourceKey: `dashboard:${user.id}`,
    isOwner,
    sharedCols: info.values.gridCols,
    onSharedChange: (cols) => info.change('gridCols', cols),
  });
  const gridStatus = info.pending.includes('gridCols')
    ? info.error ? 'Layout not saved' : 'Saving layout...'
    : '';


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
    [pages.length, enqueue, bumpListGeneration, setPages],
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
        void refreshList();
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
      gridCols: grid.preferredCols,
      dashHex,
      backHex,
      infoText1,
      infoMode1,
      infoHeight1: infoHeight1Ref.current,
      infoText,
      infoMode,
      infoHeight: infoHeightRef.current,
      pages: getCurrentPages().filter((page) => isOwner || !page.isPrivate).slice(0, 20).map((page) => ({
        _id: page._id,
        title: page.title || "",
        description: page.description || "",
        isPrivate: Boolean(page.isPrivate),
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
    grid.preferredCols,
    dashHex,
    backHex,
    infoText1,
    infoMode1,
    infoText,
    infoMode,
    getCurrentPages,
  ]);

  // Keep loading widths current before navigation can paint its fallback.
  useLayoutEffect(() => {
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
      className="dashboard-shell overscroll-none flex flex-col"
      style={{
        backgroundColor: backHex,
        "--focus-ring": focusRingOn(backHex),
      }}
    >
      <DashboardChrome dashHex={dashHex}>
        <DashHeader
          usernameTitle={user.usernameTitle}
          usernameTag={user.usernameTag}
          email={user.email}
          isOwner={isOwner}
          isEditMode={isEditMode}
          statusText={gridStatus || (isSyncing ? "Saving..." : "")}
          onToggleEdit={() => setIsEditMode((m) => !m)}
          onTitleSave={(newTag) => router.replace(`/${newTag}`)}
          grid={grid}
        />
      </DashboardChrome>

      <DashboardContent
        backHex={backHex}
        revealKey={user.usernameTag ? `dashboard:${user.usernameTag}` : undefined}
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
              onChange={(text) => info.change("infoText1", text)}
              onModeChange={(mode) => info.change("infoMode1", mode)}
              statusLabel={info.statusFor("infoText1", "infoMode1")}
              hasError={Boolean(info.error)}
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
          <div className={`grid ${grid.gridClass} gap-[7px] sm:gap-4`}>
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
                    gridCols: existing && 'gridCols' in existing
                      ? existing.gridCols
                      : page.pageMetaData?.gridCols ?? null,
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
              onChange={(text) => info.change("infoText", text)}
              initialHeight={infoHeightRef.current}
              onHeight={handleBelowHeight}
              onModeChange={(mode) => info.change("infoMode", mode)}
              statusLabel={info.statusFor("infoText", "infoMode")}
              hasError={Boolean(info.error)}
            />
          </div>
        ) : null}
      </DashboardContent>

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
