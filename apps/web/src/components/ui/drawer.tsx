import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import type { ComponentProps } from "react";
import { cn } from "#/lib/utils";

/**
 * A sheet from the bottom of the screen (shadcn's Drawer, on Base UI's).
 * Modeless when `modal={false}` (issue #209): no backdrop, the page behind
 * keeps scrolling and taking taps and keys. On a wider screen it's a card
 * at the bottom right rather than the full width.
 */
function Drawer(props: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-xl border border-b-0 bg-popover text-popover-foreground shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.35)] outline-none",
          "sm:right-4 sm:left-auto sm:w-[26rem] sm:rounded-b-none",
          // Where its snap point and a swipe put it; in and out from below.
          "[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] transition-transform duration-200 ease-out data-[swiping]:transition-none",
          "data-[starting-style]:[transform:translateY(100%)] data-[ending-style]:[transform:translateY(100%)]",
          className,
        )}
        {...props}
      >
        {/* The handle: dragged up for more, down to close. */}
        <div className="mx-auto mt-2 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Portal>
  );
}

function DrawerTitle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-sm font-semibold", className)} {...props} />;
}

function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

export { Drawer, DrawerTrigger, DrawerContent, DrawerTitle, DrawerClose };
