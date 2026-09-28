"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDialogFocusReturn } from "@/hooks/use-dialog-focus-return";

/** Small-screen top bar with a menu button that opens the sidebar as a
 * drawer. See docs/SPEC.md "UI" (responsive). */
export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const { capture, restoreFocus } = useDialogFocusReturn();

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Open menu"
        onClick={() => {
          capture();
          setOpen(true);
        }}
      >
        <Menu size={18} aria-hidden="true" />
      </Button>
      <span className="text-sm font-bold tracking-tight text-foreground">
        Rad<span className="text-caliper">Tempo</span>
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={restoreFocus}
          className="left-0 top-0 h-full max-w-64 -translate-x-0 -translate-y-0 rounded-none border-r border-l-0 border-t-0 border-b-0 p-0"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <Sidebar
            isAdmin={isAdmin}
            className="w-64"
            onNavigate={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
