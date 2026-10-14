"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type SubmitEvent,
} from "react";

import type { Validator } from "./validation";

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

/** What a field component needs: spread it on `Input` or `PasswordInput`. */
export interface FieldBinding {
  id: string;
  name: string;
  error: string | undefined;
  onBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export interface FormController<F extends string> {
  /** Stable id of a field's control, for the label and the error summary links. */
  idOf: (field: F) => string;
  errors: FieldErrors<F>;
  field: (field: F) => FieldBinding;
  /**
   * Reads and validates every field on submit. With errors, they are shown and the
   * first invalid field takes the focus; returns `null`.
   */
  submit: (event: SubmitEvent<HTMLFormElement>) => Record<F, string> | null;
  /** An error the API found in a field (a breached password, a wrong current one). */
  setFieldError: (field: F, message: string) => void;
}

/** The focus is leaving for the form's submit button, which validates everything anyway. */
function leavingForSubmit(event: FocusEvent<HTMLInputElement>): boolean {
  const next = event.relatedTarget;
  return (
    next instanceof HTMLButtonElement &&
    next.type === "submit" &&
    next.form === event.currentTarget.form
  );
}

/**
 * The validation behaviour every form of the web shares (docs/DESIGN.md, 3.2):
 *
 * - An error appears when the field loses focus or on submit, never while typing.
 * - It goes away as soon as the value is fixed. Removing it while typing, not on blur,
 *   keeps the layout still when the person moves to the button: a message that vanished
 *   on blur would pull the button from under the pointer and the click would be lost.
 * - On submit, the first invalid field takes the focus and a summary lists the errors.
 */
export function useForm<F extends string>(validators: Record<F, Validator>): FormController<F> {
  const formId = useId();
  const [errors, setErrors] = useState<FieldErrors<F>>({});
  const validatorsRef = useRef(validators);
  const fields = Object.keys(validators) as F[];

  const idOf = useCallback((field: F) => `${formId}-${field}`, [formId]);

  const focus = useCallback(
    (field: F) => {
      // After React has drawn the error, so the message is read with the field.
      requestAnimationFrame(() => {
        document.getElementById(idOf(field))?.focus();
      });
    },
    [idOf],
  );

  return {
    idOf,
    errors,
    field: (field) => ({
      id: idOf(field),
      name: field,
      error: errors[field],
      onBlur: (event) => {
        const { value } = event.currentTarget;
        // An empty field left behind is not an error yet, and the submit button checks all.
        if (value === "" || leavingForSubmit(event)) return;
        const message = validatorsRef.current[field](value);
        if (message !== undefined) setErrors((current) => ({ ...current, [field]: message }));
      },
      onChange: (event) => {
        if (errors[field] === undefined) return;
        if (validatorsRef.current[field](event.currentTarget.value) === undefined) {
          setErrors((current) => ({ ...current, [field]: undefined }));
        }
      },
    }),
    submit: (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const values = {} as Record<F, string>;
      const found: FieldErrors<F> = {};
      for (const field of fields) {
        const value = data.get(field);
        values[field] = typeof value === "string" ? value : "";
        const message = validatorsRef.current[field](values[field]);
        if (message !== undefined) found[field] = message;
      }
      setErrors(found);
      const firstInvalid = fields.find((field) => found[field] !== undefined);
      if (firstInvalid !== undefined) {
        focus(firstInvalid);
        return null;
      }
      return values;
    },
    setFieldError: (field, message) => {
      setErrors((current) => ({ ...current, [field]: message }));
      focus(field);
    },
  };
}
