"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Eye, LogOut, ArrowLeft } from "lucide-react";
import { signOut } from "next-auth/react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { mutationFailureDetail, useToast } from "@/context/ToastContext";
import { mergeServerAndOptimistic } from "@/lib/optimisticMerge";
import { reorderItemsByIndex, swapItemsByIds } from "@/lib/ordering";
import { useQueue } from "@/lib/useQueue";
import { setPageSnapshot } from "@/lib/routeTransitionCache";
import PostCard from "@/components/page/PostCard";
import PageInfoEditor from "@/components/page/PageInfoEditor";
import CreatePostModal from "@/components/page/CreatePostModal";
import EditPostModal from "@/components/page/EditPostModal";
import BulkUploadModal from "@/components/page/BulkUploadModal";
import PhotoShowModal from "@/components/page/PhotoShowModal";
import { lighten, hexToRgba } from "@/components/dashboard/DashHeader";

function hasVisiblePageInfo(value) {
  return Boolean(value && value !== "<p><br></p>" && value.trim() !== "");
}

export default function PageViewClient({ user, page, initialPosts }) {
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
  const [posts, setPosts] = useState(initialPosts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFiles, setBulkFiles] = useState([]);
  const [lightboxPost, setLightboxPost] = useState(null);
  const [hasPageInfoContent, setHasPageInfoContent] = useState(() =>
    hasVisiblePageInfo(page.pageMetaData?.infoText2 || ""),
  );
  const prefetchedRoutesRef = useRef(new Set());

  const lightboxPosts = posts.filter((p) => !p._optimistic);
  const dashboardHref = `/${user.usernameTag}`;

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
      hasVisiblePageInfo(page.pageMetaData?.infoText2 || ""),
    );
  }, [page._id, page.pageMetaData?.infoText2]);

  useEffect(() => {
    setPosts((currentPosts) =>
      mergeServerAndOptimistic(initialPosts, currentPosts),
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
  }, [initialPosts]);

  useEffect(() => {
    if (!user?.usernameTag || !page?.slug) return;

    setPageSnapshot(user.usernameTag, page.slug, {
      pageTitle: page.title || "",
      userEmail: user.email || "",
      dashHex,
      backHex,
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
    page?.slug,
    page?.title,
    dashHex,
    backHex,
    posts,
  ]);

  useEffect(() => {
    document.documentElement.style.backgroundColor = dashHex;
    return () => {
      document.documentElement.style.backgroundColor = "";
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
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
    [posts.length, enqueue, page._id],
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
    const previousPosts = posts;
    const nextOrderIndex = data.order_index ?? editingPost.order_index ?? 1;

    setPosts((currentPosts) =>
      reorderItemsByIndex(currentPosts, postId, nextOrderIndex, data),
    );
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
          reorderItemsByIndex(
            currentPosts,
            postId,
            updated.order_index ?? nextOrderIndex,
            updated,
          ),
        );
      },
      onRollback: () => {
        setPosts(previousPosts);
      },
    });
  }

  // ── Delete post ──
  function handleDeletePost(post) {
    // if (!confirm(`Delete "${post.title || "this post"}"?`)) return;
    setPosts((p) => p.filter((x) => x._id !== post._id));

    enqueue({
      type: "delete",
      description: `Couldn't delete "${post.title || "that post"}"`,
      fn: async () => {
        const res = await fetch(`/api/posts/${post._id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete post");
      },
      onRollback: () => {
        setPosts((p) => {
          const next = [...p, post];
          return next.sort((a, b) => a.order_index - b.order_index);
        });
      },
    });
  }

  // ── Reorder ──
  // Swap array positions AND renumber order_index together, then adopt only
  // the newest server response. See DashboardViewClient for the reasoning:
  // applying an earlier response to state that already reflects later clicks
  // makes a multi-place move visibly stagger backwards before settling.
  const reorderSeqRef = useRef(0);

  function moveByOffset(post, offset) {
    const idx = posts.findIndex((p) => p._id === post._id);
    const targetIdx = idx + offset;
    if (idx === -1 || targetIdx < 0 || targetIdx >= posts.length) return;

    const other = posts[targetIdx];
    if (post._optimistic || other._optimistic) return;

    // flushSync so a rapid second click reads the result of this one. See
    // DashboardViewClient for why the duplicate would otherwise cancel out.
    flushSync(() => {
      setPosts(swapItemsByIds(posts, post._id, other._id));
    });

    const toIndex = targetIdx + 1;
    const seq = ++reorderSeqRef.current;

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

        const { ordering } = await res.json();
        // Superseded by a later click — its response will settle the order.
        if (seq !== reorderSeqRef.current || !Array.isArray(ordering)) return;

        const indexById = new Map(
          ordering.map((entry) => [entry._id, entry.order_index]),
        );
        setPosts((currentPosts) =>
          [...currentPosts]
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
      style={{ backgroundColor: hexToRgba(backHex, 0.5) }}
    >
      <header
        className="sticky top-0 left-0 right-0 z-40 shadow-md"
        style={{
          backgroundColor: dashHex,
          paddingTop: "env(safe-area-inset-top, 0px)",
          marginTop: "-4px",
          paddingBottom: "4px",
        }}
      >
        <div className="flex items-center justify-between min-h-[52px] sm:min-h-[64px] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push(`/${user.usernameTag}`)}
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
              style={{ color: lighten(dashHex, 245) }}
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
        className="w-full flex-1 px-2 sm:px-4 md:px-5 pt-[33px]"
        style={{
          backgroundColor: hexToRgba(backHex, 1),
          paddingBottom: reserveHiddenInfoSpace
            ? "calc(18rem + 88px)"
            : "18rem",
        }}
      >
        <div className="max-w-7xl mx-auto">
          {posts.length === 0 && !isEditMode && (
            <p className="text-neutral-500 text-center py-12">No posts yet.</p>
          )}
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
              />
            ))}
          </div>
          <div className="mt-6">
            <PageInfoEditor
              pageId={page._id}
              initialText1={page.pageMetaData?.infoText1 || ""}
              initialText2={page.pageMetaData?.infoText2 || ""}
              isEditMode={isOwner && isEditMode}
              onHasContentChange={setHasPageInfoContent}
            />
          </div>
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
