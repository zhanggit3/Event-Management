"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/actions/notifications";
import type { NotificationWithActor } from "@/types/database";
import { cn } from "@/lib/utils";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationWithActor[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    const result = await getNotifications(20);
    if (result.data) setNotifications(result.data);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const onFocus = () => { if (!open) fetchNotifications(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchNotifications, open]);

  async function handleClick(n: NotificationWithActor) {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/[0.06] transition-colors shrink-0">
          <Bell className="w-4 h-4 text-white/50" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-indigo-500 text-white rounded-full leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-80 bg-[#0E0E1A] border border-white/[0.08] text-white p-0 shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-sm font-semibold text-white">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-white/30">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 border-b border-white/[0.04] text-left hover:bg-white/[0.04] transition-colors",
                  !n.is_read && "bg-indigo-500/[0.05]"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                    n.is_read ? "bg-transparent" : "bg-indigo-400"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/80 leading-snug line-clamp-2">{n.title}</p>
                  {n.body && (
                    <p className="text-xs text-white/40 mt-0.5 truncate">{n.body}</p>
                  )}
                  <p className="text-[10px] text-white/25 mt-1">
                    {relativeTime(n.created_at)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
