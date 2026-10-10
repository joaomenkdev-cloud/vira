"use client";

import { Eye, EyeOff, Search, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from "react";

import { cn } from "../lib/cn";
import { useControllable } from "../lib/use-controllable";
import { IconButton } from "./button";
import {
  controlStyles,
  Field,
  fieldHeight,
  type FieldControlProps,
  type FieldProps,
  type FieldSize,
} from "./field";
import { Icon } from "./icon";

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "id" | "className" | "aria-invalid" | "aria-describedby" | "aria-required"
>;

export interface InputProps
  extends NativeInputProps, Pick<FieldProps, "label" | "optional" | "hint" | "error" | "id"> {
  /** Height of the control: 48 px (default, checkout and mobile) or 44 px (organiser panel). */
  fieldSize?: FieldSize;
  className?: string;
  /** The field container. */
  ref?: Ref<HTMLInputElement>;
}

const DEFAULT_AUTOCOMPLETE: Partial<Record<string, string>> = {
  email: "email",
  tel: "tel",
};

/**
 * A labelled text field (docs/DESIGN.md, 3.2). It covers `text`, `email`, `tel`, `url`,
 * `number` and the native `date`/`time` types. Validate on blur and on submit, never
 * on every key stroke: pass `error` when you have one.
 */
export function Input({
  label,
  optional,
  hint,
  error,
  id,
  fieldSize,
  className,
  type = "text",
  autoComplete,
  ref,
  ...rest
}: InputProps) {
  return (
    <Field
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => (
        <input
          ref={ref}
          type={type}
          autoComplete={autoComplete ?? DEFAULT_AUTOCOMPLETE[type]}
          className={cn(
            controlStyles({ invalid: Boolean(error) }),
            fieldHeight({ size: fieldSize }),
          )}
          {...control}
          {...rest}
        />
      )}
    </Field>
  );
}

export interface PasswordInputProps extends Omit<InputProps, "type"> {
  /** `new-password` when creating or changing it; the default is `current-password`. */
  autoComplete?: "current-password" | "new-password";
}

/** A password field with a show/hide button (`aria-pressed`). */
export function PasswordInput({
  label,
  optional,
  hint,
  error,
  id,
  fieldSize,
  className,
  autoComplete = "current-password",
  ref,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => (
        <div className="relative">
          <input
            ref={ref}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            className={cn(
              controlStyles({ invalid: Boolean(error) }),
              fieldHeight({ size: fieldSize }),
              "pr-12",
            )}
            {...control}
            {...rest}
          />
          <IconButton
            icon={visible ? EyeOff : Eye}
            label="Mostrar senha"
            aria-pressed={visible}
            disabled={rest.disabled}
            onClick={() => {
              setVisible((current) => !current);
            }}
            className="absolute top-1/2 right-0 -translate-y-1/2"
          />
        </div>
      )}
    </Field>
  );
}

export interface SearchInputProps extends Omit<
  InputProps,
  "type" | "label" | "optional" | "error" | "hint"
> {
  /** Names the field for assistive technology; it stays visible only if `showLabel` is set. */
  label: string;
  showLabel?: boolean;
  /** Called after the clear button empties the field. */
  onClear?: () => void;
}

/** A search field with a leading icon and a clear button that appears once there is text. */
export function SearchInput({
  label,
  showLabel = false,
  id,
  fieldSize,
  className,
  value,
  defaultValue,
  onChange,
  onClear,
  ref,
  ...rest
}: SearchInputProps) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useControllable<string>(
    value === undefined ? undefined : String(value),
    defaultValue === undefined ? "" : String(defaultValue),
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setText(event.target.value);
    onChange?.(event);
  }

  function clear() {
    setText("");
    onClear?.();
    innerRef.current?.focus();
  }

  function setRefs(node: HTMLInputElement | null) {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  return (
    <Field label={label} required={false} id={id} className={className} labelHidden={!showLabel}>
      {(control: FieldControlProps) => (
        <div className="relative">
          <Icon
            icon={Search}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
          <input
            ref={setRefs}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            value={text}
            onChange={handleChange}
            className={cn(
              controlStyles({ invalid: false }),
              fieldHeight({ size: fieldSize }),
              "pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none",
            )}
            {...control}
            {...rest}
          />
          {text ? (
            <IconButton
              icon={X}
              label="Limpar busca"
              onClick={clear}
              className="absolute top-1/2 right-0 -translate-y-1/2"
            />
          ) : null}
        </div>
      )}
    </Field>
  );
}
