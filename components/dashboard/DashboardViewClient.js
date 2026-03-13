"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useQueue } from "@/lib/useQueue";
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
  const { enqueue } = useQueue();

  const isOwner = sessionUser?.usernameTag === user.usernameTag;
  const [isEditMode, setIsEditMode] = useState(false);
  const [pages, setPages] = useState(initialPages);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const prefetchedRoutesRef = useRef(new Set());

  // ── Info text ──
  async function handleSaveInfo(infoText) {
    await fetch("/api/user/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infoText }),
    });
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
    const pageId = editingPage._id;
    setPages((prev) =>
      prev.map((p) => (p._id === pageId ? { ...p, ...data } : p)),
    );
    setEditingPage(null);

    enqueue({
      type: "update",
      fn: async () => {
        const res = await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to update page");
        const updated = await res.json();
        setPages((prev) => prev.map((p) => (p._id === pageId ? updated : p)));
      },
      onRollback: () => {
        setPages((prev) =>
          prev.map((p) => (p._id === pageId ? editingPage : p)),
        );
      },
    });
  }

  // ── Delete page ──
  function handleDeletePage(page) {
    if (
      !confirm(
        `Delete "${page.title}"? This will also delete all its posts and files.`,
      )
    )
      return;
    setPages((prev) => prev.filter((p) => p._id !== page._id));

    enqueue({
      type: "delete",
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
  function handleMoveUp(page) {
    const idx = pages.findIndex((p) => p._id === page._id);
    if (idx <= 0) return;
    const other = pages[idx - 1];
    const next = [...pages];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setPages(next);

    enqueue({
      type: "update",
      fn: async () => {
        await fetch("/api/pages/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId1: page._id, pageId2: other._id }),
        });
      },
    });
  }

  function handleMoveDown(page) {
    const idx = pages.findIndex((p) => p._id === page._id);
    if (idx >= pages.length - 1) return;
    const other = pages[idx + 1];
    const next = [...pages];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setPages(next);

    enqueue({
      type: "update",
      fn: async () => {
        await fetch("/api/pages/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId1: page._id, pageId2: other._id }),
        });
      },
    });
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

  return (
    <div
      className="min-h-[150vh] overscroll-none"
      style={{ backgroundColor: backHex }}
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
          onToggleEdit={() => setIsEditMode((m) => !m)}
          onTitleSave={(newTag) => router.replace(`/${newTag}`)}
        />
      </div>

      <main className="w-full px-[10px] md:px-8 pt-[1.8rem] pb-72">
        {visiblePages.length === 0 && !isEditMode && (
          <p className="text-neutral-500 text-center py-12">No pages yet.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4">
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
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex justify-end gap-3 px-4 sm:px-6 py-4 bg-neutral-900/75 backdrop-blur-[5px] border-t border-white/10"
          aria-label="Page actions"
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
          onClose={() => setEditingPage(null)}
          onSave={handleEditPage}
        />
      )}
    </div>
  );
}
