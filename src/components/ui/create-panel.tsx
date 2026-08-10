"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Every create form in the app used to be a narrow card pinned to a column
// beside the list it added to — permanently, whether or not anyone was
// creating anything, with its fields stacked one per row inside ~420px while
// the page had a thousand spare pixels next to it.
//
// This is the replacement: a bar that says "+ Add …", opening in place into a
// panel that runs the full width of the content. The list keeps the whole
// page the rest of the time.
//
// It owns nothing but open/closed. Each form keeps its own state, validation
// and submit path, and calls useCreatePanelClose() after a successful save to
// collapse the panel it sits in.
//
// Closing is exposed through context rather than an onCreated prop because
// these panels are rendered from Server Components, and a function cannot
// cross that boundary. The hook is a no-op outside a panel, so the same form
// still works on its own route.
const CreatePanelContext = createContext<(() => void) | null>(null);

export function useCreatePanelClose() {
  const close = useContext(CreatePanelContext);
  return useCallback(() => close?.(), [close]);
}
export function CreatePanel({
  title,
  hint,
  addLabel,
  cancelLabel,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  addLabel: string;
  cancelLabel: string;
  /** Open on load when there is nothing in the list to hide behind. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Land the caret in the first field rather than making the user hunt for
    // it after the panel expands.
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("input, select, textarea")
        ?.focus();
    });
  }

  return (
    <section className="flex flex-col rounded-xl ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant={open ? "ghost" : "default"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          {open ? (
            cancelLabel
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden />
              {addLabel}
            </>
          )}
        </Button>
      </div>

      {open ? (
        <div id={panelId} ref={panelRef} className="border-t border-border p-4">
          <CreatePanelContext.Provider value={close}>
            {children}
          </CreatePanelContext.Provider>
        </div>
      ) : null}
    </section>
  );
}

// The layout every create form inside a panel uses, so they line up with each
// other. Wide controls (a description, a picker with its own scroll box) opt
// out with CREATE_FIELD_WIDE.
export const CREATE_GRID =
  "grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3";
export const CREATE_GRID_4 =
  "grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4";
// col-span-full rather than a per-column-count span, so the same class is
// correct whichever grid the form picked.
export const CREATE_FIELD_WIDE = "col-span-full";
export const CREATE_ACTIONS =
  "col-span-full flex flex-wrap items-center gap-3 pt-1";
