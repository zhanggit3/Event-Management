"use client";

import { useState, useTransition } from "react";
import { Trash2, MapPin, AlignLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/app/actions/calendar";
import type { CalendarEvent } from "@/types/database";

const inputClass = "flex h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all";
const labelClass = "text-xs font-semibold text-white/50 uppercase tracking-widest block mb-1.5";

function toDatetimeLocal(isoString: string): string {
  const date = new Date(isoString);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function toDateOnly(isoString: string): string {
  return isoString.substring(0, 10);
}

interface CalendarEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentId: string;
  eventId: string;
  componentColor: string | null;
  initialDate: string | null;
  editingEvent: CalendarEvent | null;
  eventSlug: string;
  componentSlug: string;
  onEventCreated: (event: CalendarEvent) => void;
  onEventUpdated: (event: CalendarEvent) => void;
  onEventDeleted: (id: string) => void;
}

export function CalendarEventModal({
  open,
  onOpenChange,
  componentId,
  eventId,
  componentColor,
  initialDate,
  editingEvent,
  eventSlug,
  componentSlug,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
}: CalendarEventModalProps) {
  const isEdit = !!editingEvent;
  const initialIsAllDay = editingEvent?.is_all_day ?? false;

  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [description, setDescription] = useState(editingEvent?.description ?? "");
  const [isAllDay, setIsAllDay] = useState(initialIsAllDay);
  const [startTime, setStartTime] = useState(() => {
    if (editingEvent) {
      return initialIsAllDay
        ? toDateOnly(editingEvent.start_time)
        : toDatetimeLocal(editingEvent.start_time);
    }
    if (initialDate) {
      const dateStr = initialDate.substring(0, 10);
      return initialIsAllDay ? dateStr : `${dateStr}T09:00`;
    }
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return toDatetimeLocal(now.toISOString());
  });
  const [endTime, setEndTime] = useState(() => {
    if (editingEvent?.end_time) {
      return initialIsAllDay
        ? toDateOnly(editingEvent.end_time)
        : toDatetimeLocal(editingEvent.end_time);
    }
    return "";
  });
  const [location, setLocation] = useState(editingEvent?.location ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleAllDayChange(value: boolean) {
    setIsAllDay(value);
    if (value) {
      setStartTime((s) => s.substring(0, 10));
      setEndTime((e) => (e ? e.substring(0, 10) : ""));
    } else {
      setStartTime((s) => `${s.substring(0, 10)}T09:00`);
      setEndTime((e) => (e ? `${e.substring(0, 10)}T10:00` : ""));
    }
  }

  function buildStartISO(value: string): string {
    if (isAllDay) return value;
    return new Date(value).toISOString();
  }

  function buildEndISO(value: string): string {
    if (!value) return "";
    if (isAllDay) return value;
    return new Date(value).toISOString();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setError(null);
    const formData = new FormData();
    formData.set("component_id", componentId);
    formData.set("event_id", eventId);
    formData.set("title", title.trim());
    formData.set("description", description);
    formData.set("start_time", buildStartISO(startTime));
    formData.set("end_time", buildEndISO(endTime));
    formData.set("is_all_day", String(isAllDay));
    formData.set("location", location);
    formData.set("color", componentColor ?? "");
    formData.set("event_slug", eventSlug);
    formData.set("component_slug", componentSlug);

    startTransition(async () => {
      if (isEdit) {
        const result = await updateCalendarEvent(editingEvent!.id, formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.data) {
          onEventUpdated(result.data);
          onOpenChange(false);
        }
      } else {
        const result = await createCalendarEvent(formData);
        if (result?.error) {
          setError(result.error);
        } else if (result?.data) {
          onEventCreated(result.data);
          onOpenChange(false);
        }
      }
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const result = await deleteCalendarEvent(
        editingEvent!.id,
        eventSlug,
        componentSlug
      );
      if (result?.error) {
        setError(result.error);
      } else {
        onEventDeleted(editingEvent!.id);
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="cal-title" className={labelClass}>Title *</label>
            <input
              id="cal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
              autoFocus
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cal-allday"
              checked={isAllDay}
              onChange={(e) => handleAllDayChange(e.target.checked)}
              className="h-4 w-4 rounded border border-white/20 bg-white/[0.06] accent-indigo-500"
            />
            <label htmlFor="cal-allday" className="text-xs font-semibold text-white/50 uppercase tracking-widest cursor-pointer">
              All day
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cal-start" className={labelClass}>Start *</label>
              <input
                id="cal-start"
                type={isAllDay ? "date" : "datetime-local"}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cal-end" className={labelClass}>End</label>
              <input
                id="cal-end"
                type={isAllDay ? "date" : "datetime-local"}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cal-location" className={`${labelClass} flex items-center gap-1.5`}>
              <MapPin className="w-3.5 h-3.5" />
              Location
            </label>
            <input
              id="cal-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional location"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="cal-desc" className={`${labelClass} flex items-center gap-1.5`}>
              <AlignLeft className="w-3.5 h-3.5" />
              Description
            </label>
            <textarea
              id="cal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="flex w-full min-h-[80px] rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08] transition-all"
            />
          </div>

          <DialogFooter className="gap-2 pt-1">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl font-semibold text-xs mr-auto disabled:opacity-50 transition-all ${
                  confirmDelete
                    ? "bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                    : "bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center h-10 px-4 bg-white/[0.06] border border-white/10 rounded-xl font-semibold text-sm text-white/70 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="inline-flex items-center justify-center h-10 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
