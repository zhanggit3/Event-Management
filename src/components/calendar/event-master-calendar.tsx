"use client";

import { useState, useEffect } from "react";
import type { CalendarEvent } from "@/types/database";

interface ComponentInfo {
  id: string;
  name: string;
  color: string | null;
}

interface TaskInfo {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  parent_task_id: string | null;
  component_id: string;
}

interface EventMasterCalendarProps {
  initialEvents: CalendarEvent[];
  components: ComponentInfo[];
  eventDate?: string | null;
  eventName?: string;
  serverTasks?: TaskInfo[];
}

export function EventMasterCalendar({
  initialEvents,
  components,
  eventDate,
  eventName,
  serverTasks = [],
}: EventMasterCalendarProps) {
  const [isClient, setIsClient] = useState(false);
  const [hiddenComponents, setHiddenComponents] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsClient(true);
  }, []);

  function toggleComponent(id: string) {
    setHiddenComponents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleEvents = initialEvents.filter(
    (e) => !hiddenComponents.has(e.component_id)
  );

  const compMap = new Map(components.map((c) => [c.id, c]));

  const taskEvents = serverTasks
    .filter((t) => t.due_date && !t.parent_task_id && !hiddenComponents.has(t.component_id))
    .map((t) => {
      const comp = compMap.get(t.component_id);
      return {
        id: `task__${t.id}`,
        title: `· ${t.title}${t.status === "done" ? " ✓" : ""}`,
        start: t.due_date!,
        allDay: true,
        backgroundColor: comp?.color ?? "#94a3b8",
        borderColor: "transparent",
        textColor: "#ffffff",
        extendedProps: { isTask: true, component_name: comp?.name },
      };
    });

  const fcEvents = [
    ...visibleEvents.map((ce) => {
      const compColor = ce.component?.color ?? "#3b82f6";
      return {
        id: ce.id,
        title: ce.title,
        start: ce.start_time,
        end: ce.end_time ?? undefined,
        allDay: ce.is_all_day,
        backgroundColor: ce.color ?? compColor,
        borderColor: "transparent",
        extendedProps: {
          description: ce.description,
          location: ce.location,
          component_name: ce.component?.name,
        },
      };
    }),
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
            extendedProps: {},
          },
        ]
      : []),
  ];

  if (!isClient) {
    return (
      <div className="h-[480px] border border-dashed border-white/10 rounded-xl flex items-center justify-center">
        <span className="text-sm text-white/40">Loading calendar…</span>
      </div>
    );
  }

  return (
    <MasterCalendarShell
      fcEvents={fcEvents}
      components={components}
      hiddenComponents={hiddenComponents}
      onToggle={toggleComponent}
    />
  );
}

function MasterCalendarShell({
  fcEvents,
  components,
  hiddenComponents,
  onToggle,
}: {
  fcEvents: object[];
  components: ComponentInfo[];
  hiddenComponents: Set<string>;
  onToggle: (id: string) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FullCalendar = require("@fullcalendar/react").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dayGridPlugin = require("@fullcalendar/daygrid").default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const timeGridPlugin = require("@fullcalendar/timegrid").default;

  return (
    <div className="space-y-4">
      {components.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {components.map((comp) => {
            const hidden = hiddenComponents.has(comp.id);
            return (
              <button
                key={comp.id}
                onClick={() => onToggle(comp.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  hidden
                    ? "bg-white/[0.04] border-white/10 text-white/40"
                    : "border-transparent text-white"
                }`}
                style={
                  hidden
                    ? {}
                    : { backgroundColor: (comp.color ?? "#3b82f6") + "26", borderColor: (comp.color ?? "#3b82f6") + "40" }
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: hidden ? "rgba(255,255,255,0.2)" : (comp.color ?? "#3b82f6") }}
                />
                {comp.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="[&_.fc]:text-white/80 [&_.fc-button]:!rounded-xl [&_.fc-button]:!border-0 [&_.fc-button]:!bg-white/[0.08] [&_.fc-button]:!text-white/70 [&_.fc-button]:!font-semibold [&_.fc-button]:!shadow-none [&_.fc-button:hover]:!bg-white/[0.14] [&_.fc-button:hover]:!text-white [&_.fc-button-active]:!bg-indigo-600 [&_.fc-button-active]:!text-white [&_.fc-daygrid-day]:!border-white/[0.06] [&_.fc-col-header-cell]:!border-white/[0.06] [&_.fc-scrollgrid]:!border-white/[0.06] [&_.fc-day-today]:!bg-indigo-500/[0.1] [&_.fc-col-header-cell-cushion]:!text-white/50 [&_.fc-daygrid-day-number]:!text-white/60 [&_.fc-toolbar-title]:!text-white [&_.fc-event]:!rounded-lg [&_.fc-event]:!border-0 [&_.fc-timegrid-slot]:!border-white/[0.06] [&_.fc-timegrid-axis]:!border-white/[0.06] [&_.fc-timegrid-slot-label-cushion]:!text-white/40">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          events={fcEvents}
          height="auto"
          aspectRatio={2}
        />
      </div>
    </div>
  );
}
