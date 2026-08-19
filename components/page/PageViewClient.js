"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Eye, LogOut, ArrowLeft } from "lucide-react";
import { signOut } from "next-auth/react";
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
import {
  getPageSnapshot,
  setPageSnapshot,
} from "@/lib/routeTransitionCache";
import { decideUpAction, readUpTarget } from "@/lib/upNavigation";
import { normalizeInfoMode } from "@/lib/infoMode";
import PostCard from "@/components/page/PostCard";
import PageInfoEditor from "@/components/page/PageInfoEditor";
import CreatePostModal from "@/components/page/CreatePostModal";
import EditPostModal from "@/components/page/EditPostModal";
import BulkUploadModal from "@/components/page/BulkUploadModal";
import PhotoShowModal from "@/components/page/PhotoShowModal";
import EmptyAddButton from "@/components/EmptyAddButton";
import { focusRingOn, hexToRgba, lighten, readableInkOn } from "@/lib/colour";

function hasVisiblePageInfo(value) {
  return Boolean(value && value !== "<p><br></p>" && value.trim() !== "");
}

export default function PageViewClient({
  user,
  page,
  initialPosts,
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

  const isOwner =
    serverIsOwner || sessionUser?.usernameTag === user.usernameTag;
  const [isEditMode, setIsEditMode] = useState(false);
  // The theme poll only has anything to report while its own colours can be
  // changed, which is the owner in edit mode and nobody else.
  useThemeSync(isOwner && isEditMode);
  const [posts, setPosts] = useState(initialPosts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [lightboxPost, setLightboxPost] = useState(null);
  const [hasPageInfoContent, setHasPageInfoContent] = useState(() =>
    hasVisiblePageInfo(page.pageMetaData?.infoText2 || "") ||
    hasVisiblePageInfo(page.pageMetaData?.infoText1 || ""),
  );
  const [hasAboveInfo, setHasAboveInfo] = useState(() =>
    hasVisiblePageInfo(page.pageMetaData?.infoText1 || ""),
  );
  const prefetchedRoutesRef = useRef(new Set());

  const lightboxPosts = posts.filter((p) => !p._optimistic);
  const dashboardHref = `/${user.usernameTag}`;
  const infoAboveRef = useRef({
    text: page.pageMetaData?.infoText1 || "",
    mode: normalizeInfoMode(
      page.pageMetaData?.infoMode1,
      page.pageMetaData?.infoText1 || "",
    ),
    height: getPageSnapshot(user.usernameTag, page.slug)?.infoHeight1,
  });

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
    prefetchRoute(dashboardHref);
  }, [prefetchRoute, dashboardHref]);

  useEffect(() => {
    setHasPageInfoContent(
      hasVisiblePageInfo(page.pageMetaData?.infoText2 || "") ||
        hasVisiblePageInfo(page.pageMetaData?.infoText1 || ""),
    );
    setHasAboveInfo(hasVisiblePageInfo(page.pageMetaData?.infoText1 || ""));
  }, [
    page._id,
    page.pageMetaData?.infoText1,
    page.pageMetaData?.infoText2,
  ]);

  useLayoutEffect(() => {
    if (
      shouldMergeServerList(
        refreshGenerationRef.current,
        listGenerationRef.current,
      )
    ) {
      setPosts((currentPosts) =>
        mergeServerAndOptimistic(initialPosts, currentPosts),
      );
    }

    const savedY = takePendingScroll(listGenerationRef.current);
    if (savedY == null) return;
    window.scrollTo({ top: savedY, behavior: "instant" });
  }, [initialPosts]);

  const writePageSnapshot = useCallback(() => {
    if (!user?.usernameTag || !page?.slug) return;
    const above = infoAboveRef.current;
    setPageSnapshot(user.usernameTag, page.slug, {
      pageTitle: page.title || "",
      userEmail: user.email || "",
      isOwner,
      dashHex,
      backHex,
      infoText1: above.text || "",
      infoMode1: above.mode,
      infoHeight1: above.height,
      posts: posts.slice(0, 30).map((post) => ({
        _id: post._id,
        title: post.title || "",
        content_type: post.content_type || "photo",
        thumbnail: post.thumbnail || "",
        blurDataURL: post.blurDataURL || "",
      })),
    });
  }, [
    user?.usernameTag,
    user?.email,
    isOwner,
    page?.slug,
    page?.title,
    dashHex,
    backHex,
    posts,
  ]);

  useEffect(() => {
    writePageSnapshot();
  }, [writePageSnapshot]);

  const handleAboveMeta = useCallback(
    ({ text, mode }) => {
      infoAboveRef.current.text = text;
      infoAboveRef.current.mode = mode;
      const visible = hasVisiblePageInfo(text);
      setHasAboveInfo((current) => (current === visible ? current : visible));
      writePageSnapshot();
    },
    [writePageSnapshot],
  );

  const handleAboveHeight = useCallback(
    (height) => {
      if (!Number.isFinite(height) || height <= 0) return;
      if (infoAboveRef.current.height === height) return;
      infoAboveRef.current.height = height;
      writePageSnapshot();
    },
    [writePageSnapshot],
  );

  useEffect(() => {
    document.documentElement.style.backgroundColor = dashHex;
    return () => {
      document.documentElement.style.backgroundColor = "";
    };
  }, [dashHex]);

  // ── Create post ──
  const handleCreatePost = useCallback(
    async (data) => {
      const tempId = `_opt_${Date.now()}_${Math.random()}`;
      const optimistic = {
        ...data,
        _id: tempId,
        _optimistic: true,
        order_index: posts.length + 1,
      };
      bumpListGeneration();
      setPosts((prev) => [...prev, optimistic]);

      enqueue({
        type: "create",
        description: "Couldn't save your new post",
        fn: async () => {
          const res = await fetch(`/api/posts?pageId=${page._id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, pageId: page._id }),
          });
          if (!res.ok) throw new Error("Failed to create post");
          const created = await res.json();
          setPosts((prev) => prev.map((p) => (p._id === tempId ? created : p)));
        },
        onRollback: () => {
          setPosts((prev) => prev.filter((p) => p._id !== tempId));
        },
      });
    },
    [posts.length, enqueue, page._id, bumpListGeneration],
  );

  // ── Bulk upload ──
  function handleBulkUpload(files) {
    setBulkFiles(files || []);
    setShowCreate(false);
    setShowBulkUpload(true);
  }

  function handleOpenBulkMode() {
    setShowCreate(false);
    setBulkFiles([]);
    setShowBulkUpload(true);
  }

  async function handleBulkComplete(uploadedData) {
    await handleCreatePost({
      ...uploadedData,
      content_type: "photo",
      title: "",
      description: "",
    });
  }

  // ── Edit post ──
  async function handleEditPost(data) {
    if (!editingPost) return;

    const postId = editingPost._id;
    const snapshot = { ...editingPost };
    const allowReorder = data.order_index !== undefined;
    const editGeneration = bumpListGeneration();

    setPosts((currentPosts) => applyEditLocally(currentPosts, postId, data));
    setEditingPost(null);

    enqueue({
      type: "update",
      description: "Couldn't save your changes to that post",
      fn: async () => {
        const res = await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update post");
        const updated = await res.json();
        setPosts((currentPosts) =>
          applyEditFromServer(currentPosts, postId, updated, {
            allowReorder,
            editGeneration,
            currentGeneration: listGenerationRef.current,
          }),
        );
      },
      onRollback: () => {
        setPosts((currentPosts) =>
          rollbackItemSnapshot(currentPosts, postId, snapshot),
        );
      },
    });
  }

  // ── Delete post ──
  function handleDeletePost(post) {
    bumpListGeneration();
    setPosts((p) =>
      normalizeOrderIndexes(p.filter((x) => x._id !== post._id)),
    );

    enqueue({
      type: "delete",
      description: `Couldn't delete "${post.title || "that post"}"`,
      fn: async () => {
        const res = await fetch(`/api/posts/${post._id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete post");
      },
      onRollback: () => {
        setPosts((p) => restoreDeletedItem(p, post));
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
  function moveByOffset(post, offset) {
    const idx = posts.findIndex((p) => p._id === post._id);
    const targetIdx = idx + offset;
    if (idx === -1 || targetIdx < 0 || targetIdx >= posts.length) return;

    const other = posts[targetIdx];
    if (post._optimistic || other._optimistic) return;

    // flushSync so a rapid second click reads the result of this one. Without
    // it React may not have committed yet, both clicks compute the same move,
    // and the duplicate cancels the first out.
    bumpListGeneration();
    flushSync(() => {
      setPosts(swapItemsByIds(posts, post._id, other._id));
    });

    const toIndex = targetIdx + 1;

    enqueue({
      type: "update",
      description: "Couldn't save the new post order",
      // The rollback resyncs from the server rather than restoring a snapshot.
      rollsBackLocally: false,
      fn: async () => {
        const res = await fetch("/api/posts/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: post._id, toIndex }),
        });
        if (!res.ok) throw new Error("Failed to reorder posts");
        await res.json().catch(() => ({}));
      },
      onRollback: () => {
        refreshWithScrollRestore();
      },
    });
  }

  function handleMoveLeft(post) {
    moveByOffset(post, -1);
  }

  function handleMoveRight(post) {
    moveByOffset(post, 1);
  }

  // ── Post click ──
  function handlePostClick(post) {
    if (post._optimistic) return;
    setLightboxPost(post);
  }

  const reserveHiddenInfoSpace = isOwner && !isEditMode && !hasPageInfoContent;

  return (
    <div
      className="min-h-screen w-full p-0 md:px-6 overscroll-none flex flex-col"
      style={{
        backgroundColor: hexToRgba(backHex, 0.5),
        "--focus-ring": focusRingOn(backHex),
      }}
    >
      <header
        className="sticky top-0 left-0 right-0 z-40 shadow-md"
        style={{
          backgroundColor: dashHex,
          paddingTop: "env(safe-area-inset-top, 0px)",
          marginTop: "-4px",
          paddingBottom: "4px",
          // See LNK-4: the header's controls sit on dashHex, so it carries its
          // own ring colour rather than the page's.
          "--focus-ring": focusRingOn(dashHex),
        }}
      >
        <div className="flex items-center justify-between min-h-[52px] sm:min-h-[64px] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (decideUpAction(readUpTarget(), dashboardHref) === "back") {
                  router.back();
                } else {
                  router.push(dashboardHref);
                }
              }}
              onMouseEnter={() => prefetchRoute(dashboardHref)}
              onFocus={() => prefetchRoute(dashboardHref)}
              onTouchStart={() => prefetchRoute(dashboardHref)}
              className="h-8 w-8 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-all"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={16} />
            </button>
            <h1
              className="text-xl sm:text-2xl font-bold tracking-wide truncate"
              // See LNK-4: chosen by measured contrast, not a fixed lighten.
              style={{ color: readableInkOn(dashHex) }}
            >
              {page.title}
            </h1>
          </div>

          <nav
            className="flex items-center gap-2 shrink-0"
            aria-label="Page actions"
          >
            {isOwner && (
              <>
                {isSyncing && (
                  <span className="text-white/60 text-xs hidden sm:block">
                    Saving...
                  </span>
                )}
                <span className="text-white/65 text-xs hidden md:block truncate max-w-[160px]">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditMode((m) => !m)}
                  className={`h-8  rounded-[3px] border text-sm font-medium  ${
                    isEditMode
                      ? "bg-white/20 text-white/90 border-white/30 hover:bg-white/25 hover:text-white w-[67px]"
                      : "bg-white/10 text-white/80 border-white/20 hover:bg-white/15 hover:text-white  w-[67px]"
                  }`}
                  aria-pressed={isEditMode}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {isEditMode ? <Eye size={14} /> : <Edit2 size={14} />}
                    {isEditMode ? "View" : "Edit"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="h-8 w-8 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-all"
                  aria-label="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </nav>
        </div>
        <div className="w-full pb-[2px]" style={{ backgroundColor: dashHex }}>
          <div
            className="h-[8px] w-full border-t border-black/15"
            style={{ backgroundColor: lighten(dashHex, 30) }}
          />
        </div>
      </header>

      <main
        className={`w-full flex-1 flex flex-col px-2 sm:px-4 md:px-5 ${
          (isOwner && isEditMode) || hasAboveInfo
            ? "pt-[33px]"
            : "pt-[calc(33px*1.5)]"
        }`}
        style={{
          backgroundColor: hexToRgba(backHex, 1),
          paddingBottom: reserveHiddenInfoSpace
            ? "calc(18rem + 88px)"
            : "18rem",
        }}
      >
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
          <PageInfoEditor
            pageId={page._id}
            initialText1={page.pageMetaData?.infoText1 || ""}
            initialText2={page.pageMetaData?.infoText2 || ""}
            initialMode={page.pageMetaData?.infoMode}
            initialMode1={page.pageMetaData?.infoMode1}
            isEditMode={isOwner && isEditMode}
            onHasContentChange={setHasPageInfoContent}
            onAboveMeta={handleAboveMeta}
            initialHeight1={infoAboveRef.current.height}
            onAboveHeight={handleAboveHeight}
          >
            {({ above, below }) => (
              <div className="flex flex-1 flex-col min-h-0">
                {above ? <div className="mb-6 shrink-0">{above}</div> : null}
                {posts.length === 0 && isOwner && isEditMode ? (
                  <div className="flex items-center justify-center min-h-[10.35rem]">
                    <EmptyAddButton
                      label="New post"
                      onClick={() => setShowCreate(true)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4">
                    {posts.map((post, idx) => (
                      <PostCard
                        key={post._id}
                        post={post}
                        isOwner={isOwner}
                        isEditMode={isEditMode}
                        onClick={handlePostClick}
                        onEdit={setEditingPost}
                        onDelete={handleDeletePost}
                        onMoveLeft={handleMoveLeft}
                        onMoveRight={handleMoveRight}
                        isFirst={idx === 0}
                        isLast={idx === posts.length - 1}
                        priority={idx < 4}
                      />
                    ))}
                  </div>
                )}
                {below ? <div className="mt-6 shrink-0">{below}</div> : null}
              </div>
            )}
          </PageInfoEditor>
        </div>
      </main>

      {isOwner && isEditMode && (
        <nav
          className="fixed bottom-0 right-0 z-40 flex justify-end gap-3 px-4 sm:px-6 py-3 bg-neutral-900/50 backdrop-blur-[5px] border-t border-white/10"
          aria-label="Post actions"
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
            New Post
          </button>
        </nav>
      )}

      {/* Modals */}
      {showCreate && (
        <CreatePostModal
          page={page}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreatePost}
          onBulkUpload={handleBulkUpload}
          onToMultiple={handleOpenBulkMode}
        />
      )}
      {showBulkUpload && (
        <BulkUploadModal
          files={bulkFiles}
          page={page}
          onClose={() => {
            setShowBulkUpload(false);
            setBulkFiles([]);
          }}
          onBackToSingle={() => {
            setShowBulkUpload(false);
            setShowCreate(true);
          }}
          onUploadComplete={handleBulkComplete}
        />
      )}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          page={page}
          itemCount={posts.length}
          onClose={() => setEditingPost(null)}
          onSave={handleEditPost}
        />
      )}
      {lightboxPost && (
        <PhotoShowModal
          post={lightboxPost}
          posts={lightboxPosts}
          onClose={() => setLightboxPost(null)}
          onNavigate={setLightboxPost}
        />
      )}
    </div>
  );
}
