"use client";

import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle
} from "@headlessui/react";

type AdminModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const modalSizeClass: Record<AdminModalSize, string> = {
  "2xl": "max-w-6xl",
  lg: "max-w-3xl",
  md: "max-w-2xl",
  sm: "max-w-lg",
  xl: "max-w-4xl"
};

export function AdminModal({
  children,
  closeDisabled = false,
  closeLabel = "Close",
  description,
  label = "Admin dialog",
  onClose,
  open = true,
  panelClassName,
  size = "lg",
  title
}: Readonly<{
  children: ReactNode;
  closeDisabled?: boolean;
  closeLabel?: string;
  description?: ReactNode;
  label?: string;
  onClose: () => void;
  open?: boolean;
  panelClassName?: string;
  size?: AdminModalSize;
  title?: ReactNode;
}>) {
  const handleClose = closeDisabled ? () => undefined : onClose;

  return (
    <Dialog className="relative z-[100]" onClose={handleClose} open={open}>
      <DialogBackdrop
        className="fixed inset-0 bg-gray-900/40 transition-opacity data-closed:opacity-0 motion-reduce:transition-none"
        transition={true}
      />
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
          <DialogPanel
            className={cx(
              "relative w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/10 transition data-closed:opacity-0 motion-reduce:transition-none",
              modalSizeClass[size],
              panelClassName
            )}
            transition={true}
          >
            {title ? (
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-semibold text-gray-900">
                    {title}
                  </DialogTitle>
                  {description ? (
                    <div className="mt-1 text-sm text-gray-500">{description}</div>
                  ) : null}
                </div>
                <button
                  aria-label={closeLabel}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={closeDisabled}
                  onClick={onClose}
                  type="button"
                >
                  {closeLabel}
                </button>
              </div>
            ) : (
              <DialogTitle className="sr-only">{label}</DialogTitle>
            )}
            {children}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export function AdminButton({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "danger" | "ghost" | "primary" | "secondary";
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-[#1FA77A] text-white hover:bg-[#188865]",
        variant === "secondary" &&
          "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
        variant === "ghost" && "bg-transparent text-gray-600 hover:bg-gray-50",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        className
      )}
      type={type}
      {...props}
    />
  );
}

export function AdminIconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA77A] disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      type={type}
      {...props}
    />
  );
}

export function AdminField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "rounded-md bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-[#1FA77A] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
        className
      )}
      {...props}
    />
  );
}

export function AdminDrawer({
  children,
  label = "Admin navigation",
  onClose,
  open = true
}: Readonly<{
  children: ReactNode;
  label?: string;
  onClose: () => void;
  open?: boolean;
}>) {
  return (
    <Dialog className="relative z-[100]" onClose={onClose} open={open}>
      <DialogBackdrop className="fixed inset-0 bg-gray-900/70" />
      <div className="fixed inset-0 z-[100] flex lg:hidden">
        <DialogPanel className="relative flex h-full w-full max-w-xs">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export function AdminMenu({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="relative inline-block text-left">{children}</div>;
}
