"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { Ref } from "react";

import { cn } from "../lib/cn";
import { controlStyles, Field, fieldHeight, type FieldProps, type FieldSize } from "./field";
import { Icon } from "./icon";
import { menuContentStyles, menuItemStyles } from "./menu-styles";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Pick<
  FieldProps,
  "label" | "optional" | "hint" | "error" | "id"
> {
  options: readonly SelectOption[];
  /** Shown while nothing is chosen. A format hint, never a replacement for the label. */
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  fieldSize?: FieldSize;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A labelled single choice (docs/DESIGN.md, 3.2 and 3.6) on the Radix Select: arrow
 * keys, Home/End, type-ahead and Esc all work, and the chosen item shows a check.
 */
export function Select({
  label,
  optional,
  hint,
  error,
  id,
  options,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  fieldSize,
  className,
  ref,
}: SelectProps) {
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
        <SelectPrimitive.Root
          {...(value === undefined ? {} : { value })}
          {...(defaultValue === undefined ? {} : { defaultValue })}
          {...(onValueChange ? { onValueChange } : {})}
          {...(name ? { name } : {})}
          {...(disabled ? { disabled } : {})}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            className={cn(
              controlStyles({ invalid: Boolean(error) }),
              fieldHeight({ size: fieldSize }),
              "flex cursor-pointer items-center justify-between gap-2 text-left data-[placeholder]:text-ink-muted",
            )}
            {...control}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon asChild>
              <Icon icon={ChevronDown} className="text-ink-muted" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={4}
              className={cn(menuContentStyles(), "max-h-menu-available")}
            >
              <SelectPrimitive.Viewport>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    {...(option.disabled ? { disabled: true } : {})}
                    className={menuItemStyles()}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Icon icon={Check} size={16} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      )}
    </Field>
  );
}
