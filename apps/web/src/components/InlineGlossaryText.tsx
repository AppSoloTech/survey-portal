import {
  buildGlossaryTextSegments,
  type ParticipantGlossaryEntry
} from "@survey-portal/shared";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export function InlineGlossaryText({
  entries,
  text
}: {
  entries: ParticipantGlossaryEntry[];
  text: string;
}) {
  const segments = useMemo(() => buildGlossaryTextSegments(text, entries), [entries, text]);

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={`text-${index}`}>{segment.text}</span>
        ) : (
          <GlossaryTerm
            canonicalTerm={segment.canonicalTerm}
            definition={segment.definition}
            key={`glossary-${segment.entryId}-${index}`}
            text={segment.text}
          />
        )
      )}
    </>
  );
}

function GlossaryTerm({
  canonicalTerm,
  definition,
  text
}: {
  canonicalTerm: string;
  definition: string;
  text: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const openedByFocusRef = useRef(false);
  const popoverId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      event.currentTarget.blur();
    }
  }

  return (
    <span
      className="inline-glossary"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        if (!isFocused) {
          setIsOpen(false);
        }
      }}
    >
      <button
        aria-describedby={isOpen ? popoverId : undefined}
        aria-description="Definition available"
        aria-expanded={isOpen}
        className="inline-glossary-trigger"
        onBlur={() => {
          setIsFocused(false);
          setIsOpen(false);
          openedByFocusRef.current = false;
        }}
        onClick={() => {
          if (openedByFocusRef.current) {
            openedByFocusRef.current = false;
            return;
          }

          setIsOpen((current) => !current);
        }}
        onFocus={() => {
          setIsFocused(true);
          setIsOpen(true);
          openedByFocusRef.current = true;
        }}
        onKeyDown={handleKeyDown}
        type="button"
      >
        {text}
      </button>
      {isOpen ? (
        <span className="inline-glossary-popover" id={popoverId} role="tooltip">
          <strong>{canonicalTerm}</strong>
          <span>{definition}</span>
        </span>
      ) : null}
    </span>
  );
}
