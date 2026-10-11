"use client";

import { ToastProvider } from "@vira/ui";

import { ButtonsDemo } from "./buttons-demo";
import { FeedbackDemo } from "./feedback-demo";
import { FormsDemo } from "./forms-demo";
import { LayoutDemo } from "./layout-demo";
import { OverlaysDemo } from "./overlays-demo";

/** Every component of @vira/ui in all its states, for review and for the screenshots. */
export function ComponentsShowcase() {
  return (
    <ToastProvider>
      <ButtonsDemo />
      <FormsDemo />
      <FeedbackDemo />
      <OverlaysDemo />
      <LayoutDemo />
    </ToastProvider>
  );
}
