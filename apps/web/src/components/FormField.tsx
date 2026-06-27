import type { ReactNode } from "react";

export type FormFieldA11yProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  id: string;
};

export function FormField({
  children,
  error,
  helperText,
  id,
  isInvalid = false,
  isOptional = false,
  isRequired = false,
  label,
  describedByIds = [],
  reveal = false
}: {
  children: (fieldProps: FormFieldA11yProps) => ReactNode;
  describedByIds?: string[];
  error?: string | null;
  helperText?: ReactNode;
  id: string;
  isInvalid?: boolean;
  isOptional?: boolean;
  isRequired?: boolean;
  label: string;
  reveal?: boolean;
}) {
  const helperId = helperText ? `${id}-helper` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [...describedByIds, helperId, errorId].filter(Boolean).join(" ");

  return (
    <label className="form-field" data-reveal={reveal ? "" : undefined} htmlFor={id}>
      <span className="form-field-label">
        <span>{label}</span>
        {isRequired ? <span className="field-requirement">Required</span> : null}
        {isOptional ? <span className="field-requirement">Optional</span> : null}
      </span>
      {children({
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error || isInvalid ? true : undefined,
        id
      })}
      {helperText ? (
        <span className="field-helper" id={helperId ?? undefined}>
          {helperText}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={errorId ?? undefined} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
