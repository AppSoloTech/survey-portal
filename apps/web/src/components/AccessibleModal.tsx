import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type InertElementState = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

export function AccessibleModal({
  children,
  className = "",
  closeOnEscape = true,
  descriptionId,
  labelledBy,
  onClose
}: {
  children: ReactNode;
  className?: string;
  closeOnEscape?: boolean;
  descriptionId?: string;
  labelledBy: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  if (!portalRef.current) {
    portalRef.current = document.createElement("div");
    portalRef.current.setAttribute("data-modal-root", "true");
  }

  useEffect(() => {
    const portalNode = portalRef.current;

    if (!portalNode) {
      return undefined;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.appendChild(portalNode);

    const inertedElements: InertElementState[] = [];

    Array.from(document.body.children).forEach((child) => {
      if (!(child instanceof HTMLElement) || child === portalNode) {
        return;
      }

      inertedElements.push({
        element: child,
        ariaHidden: child.getAttribute("aria-hidden"),
        inert: child.inert
      });
      child.setAttribute("aria-hidden", "true");
      child.inert = true;
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const initialFocusTarget =
        dialog?.querySelector<HTMLElement>("[data-autofocus]") ??
        dialog?.querySelector<HTMLElement>(focusableSelector) ??
        dialog;

      initialFocusTarget?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrameId);
      inertedElements.forEach(({ element, ariaHidden, inert }) => {
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }

        element.inert = inert;
      });
      document.body.style.overflow = originalOverflow;

      if (portalNode.parentNode) {
        portalNode.parentNode.removeChild(portalNode);
      }

      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && closeOnEscape) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    const focusableElements =
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            (element) => element.offsetParent !== null || element === document.activeElement
          )
        : [];

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog?.focus({ preventScroll: true });
      return;
    }

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const modal = (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className ? `contact-email-modal ${className}` : "contact-email-modal"}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modal, portalRef.current);
}
