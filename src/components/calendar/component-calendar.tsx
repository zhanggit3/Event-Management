"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { CalendarEventModal } from "./calendar-event-modal";
import { useComponentTasks } from "@/components/component-tasks-context";
import type { CalendarEvent } from "@/types/database";

const PRIORITY_TASK_COLOR: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#94a3b8",
};

interface ComponentCalendarProps {
  componentId: string;
  eventId: string;
  eventDate?: string | null;
  eventName?: string;
  componentColor: string | null;
  initialEvents: CalendarEvent[];
  serverTasks?: { id: string; title: string; due_date: string | null; status: string; priority: string; parent_task_id: string | null }[];
  activities?: { id: string; name: string; color: string | null; start_date: string | null; due_date: string | null }[];
  eventSlug: string;
  componentSlug: string;
  isLoggedIn: boolean;
}

export function ComponentCalendar({
  componentId,
  eventId,
  eventDate,
  eventName,
  componentColor,
  initialEvents,
  serverTasks = [],
  activities = [],
  eventSlug,
  componentSlug,
  isLoggedIn,
}: ComponentCalendarProps) {
  const [events, setEvents] = useState(initialEvents);
  const { tasks: contextTasks } = useComponentTasks();

  const taskMap = new Map<string, typeof serverTasks[0]>();
  for (const t of serverTasks) taskMap.set(t.id, t);
  for (const t of contextTasks) taskMap.set(t.id, t);
  const tasks = [...taskMap.values()];
  const [isClient, setIsClient] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  function openCreateModal(date?: string) {
    if (!isLoggedIn) return;
    setEditingEvent(null);
    setSelectedDate(date ?? null);
    setModalOpen(true);
  }

  function openEditModal(event: CalendarEvent) {
    setEditingEvent(event);
    setSelectedDate(null);
    setModalOpen(true);
  }

  const accentColor = componentColor ?? "#3b82f6";

  const taskEvents = tasks
    .filter((t) => t.due_date && !t.parent_task_id)
    .map((t) => ({
      id: `task__${t.id}`,
      title: `· ${t.title}${t.status === "done" ? " ✓" : ""}`,
      start: t.due_date!,
      allDay: true,
      backgroundColor: PRIORITY_TASK_COLOR[t.priority] ?? "#94a3b8",
      borderColor: "transparent",
      textColor: "#ffffff",
      extendedProps: { isTask: true },
    }));

  function addOneDay(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }

  const activityEvents = activities
    .filter((a) => a.start_date || a.due_date)
    .map((a) => {
      const start = a.start_date ?? a.due_date!;
      const hasRange = a.start_date && a.due_date && a.start_date !== a.due_date;
      return {
        id: `activity__${a.id}`,
        title: `◈ ${a.name}`,
        start,
        end: hasRange ? addOneDay(a.due_date!) : undefined,
        allDay: true,
        backgroundColor: a.color ?? "#6366f1",
        borderColor: "transparent",
        textColor: "#ffffff",
        extendedProps: { isActivity: true },
      };
    });

  const fcEvents = [
    ...events.map((ce) => ({
      id: ce.id,
      title: ce.title,
      start: ce.start_time,
      end: ce.end_time ?? undefined,
      allDay: ce.is_all_day,
      backgroundColor: ce.color ?? accentColor,
      borderColor: "transparent",
      extendedProps: { description: ce.description, location: ce.location, isTask: false },
    })),
    ...activityEvents,
    ...taskEvents,
    ...(eventDate
      ? [
          {
            id: "__event_day__",
            title: `🎉 ${eventName ?? "Event Day"}`,
            start: eventDate,
            allDay: true,
            backgroundColor: "#f59e0b",
            borderColor: "transparent",
            textColor: "#fff",
            extendedProps: { isTask: false },
          },
        ]
      : []),
  ];

  if (!isClient) {
    return (
      <div className="h-[560px] border border-dashed border-white/10 rounded-xl flex items-center justify-center">
        <span className="text-sm text-white/40">Loading calendar…</span>
      </div>
    );
  }

  return (
    <CalendarShell
      fcEvents={fcEvents}
      accentColor={accentColor}
      isLoggedIn={isLoggedIn}
      onDateClick={(dateStr) => openCreateModal(dateStr)}
      onEventClick={(id) => {
        if (id.startsWith("task__") || id === "__event_day__") return;
        const ev = events.find((e) => e.id === id);
        if (ev) openEditModal(ev);
      }}
      addButton={
        isLoggedIn ? (
          <button
            onClick={() => openCreateModal()}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-white text-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add event
          </button>
        ) : null
      }
    >
      {modalOpen && (
        <CalendarEventModal
          key={editingEvent?.id ?? selectedDate ?? "new"}
          open={modalOpen}
          onOpenChange={setModalOpen}
          componentId={componentId}
          eventId={eventId}
          componentColor={componentColor}
          initialDate={selectedDate}
          editingEvent={editingEvent}
          eventSlug={eventSlug}
          componentSlug={componentSlug}
          onEventCreated={(ev) => setEvents((prev) => [...prev, ev])}
          onEventUpdated={(ev) =>
            setEvents((prev) => prev.map((e) => (e.id === ev.id ? ev : e)))
          }
          onEventDeleted={(id) =>
            setEvents((prev) => prev.filter((e) => e.id !== id))
          }
        />
      )}
    </CalendarShell>
  );
}

function CalendarShell({
  fcEvents,
  accentColor,
  isLoggedIn,
  onDateClick,
  onEventClick,
  addButton,
  children,
}: {
  fcEvents: object[];
  accentColor: string;
  isLoggedIn: boolean;
  onDateClick: (dateStr: string) => void;
  onEventClick: (id: string) => void;
  addButton: React.ReactNode;
  children?: React.ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FullCalendar = require("@fullcalendar/react").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dayGridPlugin = require("@fullcalendar/daygrid").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const timeGridPlugin = require("@fullcalendar/timegrid").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const interactionPlugin = require("@fullcalendar/interaction").default;

  return (
    <div>
      <div className="flex items-center justify-end mb-3">{addButton}</div>
      <div className="[&_.fc]:text-white/80 [&_.fc-button]:!rounded-xl [&_.fc-button]:!border-0 [&_.fc-button]:!bg-white/[0.08] [&_.fc-button]:!text-white/70 [&_.fc-button]:!font-semibold [&_.fc-button]:!shadow-none [&_.fc-button:hover]:!bg-white/[0.14] [&_.fc-button:hover]:!text-white [&_.fc-button-active]:!bg-indigo-600 [&_.fc-button-active]:!text-white [&_.fc-daygrid-day]:!border-white/[0.06] [&_.fc-col-header-cell]:!border-white/[0.06] [&_.fc-scrollgrid]:!border-white/[0.06] [&_.fc-scrollgrid-section-header_th]:!border-white/[0.06] [&_.fc-scrollgrid-section-body_td]:!border-white/[0.06] [&_.fc-day-today]:!bg-indigo-500/[0.1] [&_.fc-col-header-cell-cushion]:!text-white/50 [&_.fc-daygrid-day-number]:!text-white/60 [&_.fc-toolbar-title]:!text-white [&_.fc-event]:!rounded-lg [&_.fc-event]:!border-0 [&_.fc-timegrid-slot]:!border-white/[0.06] [&_.fc-timegrid-axis]:!border-white/[0.06] [&_.fc-timegrid-slot-label-cushion]:!text-white/40">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={fcEvents}
          dateClick={
            isLoggedIn
              ? (arg: { dateStr: string }) => onDateClick(arg.dateStr)
              : undefined
          }
          eventClick={(arg: { event: { id: string } }) => onEventClick(arg.event.id)}
          height="auto"
          aspectRatio={1.8}
          eventColor={accentColor}
        />
      </div>
      {children}
    </div>
  );
}
