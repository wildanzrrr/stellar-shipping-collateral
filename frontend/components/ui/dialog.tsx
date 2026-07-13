"use client"

import * as React from "react"
import { Dialog } from "radix-ui"
import { X } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@/lib/utils"

// Context so descendants can react to dialog open/close.
const DialogOpenContext = React.createContext(false)

/**
 * Returns whether the nearest enclosing dialog is currently open.
 * Useful for triggering side-effects (e.g. refetching data) on open.
 */
function useDialogOpen(): boolean {
  return React.useContext(DialogOpenContext)
}

function DialogRoot({
  defaultOpen = false,
  ...props
}: React.ComponentProps<typeof Dialog.Root>) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <DialogOpenContext.Provider value={open}>
      <Dialog.Root {...props} open={open} onOpenChange={setOpen} />
    </DialogOpenContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Dialog.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <Dialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-5 shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </Dialog.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-2 flex flex-col gap-2", className)} {...props} />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  useDialogOpen,
}
