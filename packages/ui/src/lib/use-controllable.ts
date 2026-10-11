import { useCallback, useState } from "react";

/**
 * State that is controlled when `value` is given and local otherwise, the way native
 * inputs behave. `onChange` runs in both cases.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): readonly [T, (next: T) => void] {
  const [internal, setInternal] = useState(defaultValue);
  const isControlled = value !== undefined;

  const set = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  return [isControlled ? value : internal, set];
}
