import type { ReactNode } from "react";

type AlertVariant = "error" | "success" | "info";

export function AlertMessage({
  children,
  className = "",
  id,
  variant = "info"
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  variant?: AlertVariant;
}) {
  const role = variant === "error" ? "alert" : "status";
  const live = variant === "error" ? "assertive" : "polite";
  const variantClass = variant === "info" ? "muted" : variant;

  return (
    <p
      aria-live={live}
      className={`status ${variantClass}${className ? ` ${className}` : ""}`}
      id={id}
      role={role}
    >
      {children}
    </p>
  );
}
