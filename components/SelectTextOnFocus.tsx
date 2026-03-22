"use client";

import { useEffect } from "react";

const SKIP_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "radio",
  "range",
  "reset",
  "submit"
]);

/**
 * When the user focuses a text-like input or textarea, select all text so typing replaces it.
 * Opt out per control with data-no-select-on-focus.
 */
export function SelectTextOnFocus() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const raw = e.target;
      if (!(raw instanceof HTMLElement)) return;
      if (raw.closest("[data-no-select-on-focus]")) return;

      if (raw instanceof HTMLInputElement) {
        if (raw.readOnly || raw.disabled) return;
        if (SKIP_INPUT_TYPES.has(raw.type)) return;
        queueMicrotask(() => {
          if (document.activeElement === raw) raw.select();
        });
        return;
      }

      if (raw instanceof HTMLTextAreaElement) {
        if (raw.readOnly || raw.disabled) return;
        queueMicrotask(() => {
          if (document.activeElement === raw) raw.select();
        });
      }
    };

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
