import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ToastOptions } from "./toast";

function Trigger({ options }: { options: ToastOptions }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(options);
      }}
    >
      Disparar
    </button>
  );
}

function renderToast(options: ToastOptions) {
  return render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  );
}

async function fire() {
  await userEvent.click(screen.getByRole("button", { name: "Disparar" }));
}

/** The live regions Radix writes the announcement into. */
const announcements = () =>
  [...document.querySelectorAll("[aria-live]")].filter(
    (region) => region.getAttribute("aria-live") !== "off" && region.textContent,
  );

describe("Toast", () => {
  it("shows the title and the description", async () => {
    renderToast({ title: "Evento salvo", description: "Ele ainda é um rascunho." });
    await fire();
    // Radix also writes the text into a hidden live region, so it appears more than once.
    expect((await screen.findAllByText("Evento salvo")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ele ainda é um rascunho.").length).toBeGreaterThan(0);
  });

  it("announces a neutral toast politely", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    await waitFor(() => {
      expect(announcements().length).toBeGreaterThan(0);
    });
    expect(announcements().every((region) => region.getAttribute("aria-live") === "polite")).toBe(
      true,
    );
  });

  it("announces a danger toast at once", async () => {
    renderToast({ title: "Não foi possível salvar", tone: "danger" });
    await fire();
    await waitFor(() => {
      expect(announcements().length).toBeGreaterThan(0);
    });
    expect(
      announcements().every((region) => region.getAttribute("aria-live") === "assertive"),
    ).toBe(true);
  });

  it("has a labelled region the keyboard can jump to", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    expect(await screen.findByRole("region", { name: /Notificações/ })).toBeInTheDocument();
  });

  it("closes from its close button, which has a name", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    await userEvent.click(await screen.findByRole("button", { name: "Fechar notificação" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Fechar notificação" })).not.toBeInTheDocument();
    });
  });

  it("stacks several toasts", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    await fire();
    expect(await screen.findAllByRole("button", { name: "Fechar notificação" })).toHaveLength(2);
  });

  it("marks success and danger with an icon besides the colour", async () => {
    const { unmount } = renderToast({ title: "Pago", tone: "success" });
    await fire();
    const close = await screen.findByRole("button", { name: "Fechar notificação" });
    expect(close.closest("li")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    unmount();

    renderToast({ title: "Recusado", tone: "danger" });
    await fire();
    const closeDanger = await screen.findByRole("button", { name: "Fechar notificação" });
    expect(closeDanger.closest("li")?.querySelectorAll("svg").length).toBe(2);
  });

  it("is white on ink, floating on the one shadow", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    const toast = (await screen.findByRole("button", { name: "Fechar notificação" })).closest("li");
    expect(toast).toHaveClass("bg-ink", "text-surface", "shadow-float", "rounded-md");
  });

  it("sits at the bottom, centred on a phone and to the right from 640 px", async () => {
    renderToast({ title: "Evento salvo" });
    await fire();
    const viewport = (await screen.findByRole("region", { name: /Notificações/ })).querySelector(
      "ol",
    );
    expect(viewport).toHaveClass(
      "bottom-0",
      "items-center",
      "sm:right-0",
      "sm:items-end",
      "z-toast",
    );
  });

  it("does not block the page when nothing is shown", () => {
    renderToast({ title: "Evento salvo" });
    expect(document.querySelector("ol")).toHaveClass("pointer-events-none");
  });

  describe("timing", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("goes away by itself after five seconds", async () => {
      renderToast({ title: "Evento salvo" });
      await fire();
      await screen.findByRole("button", { name: "Fechar notificação" });
      act(() => {
        vi.advanceTimersByTime(4900);
      });
      expect(screen.getByRole("button", { name: "Fechar notificação" })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Fechar notificação" }),
        ).not.toBeInTheDocument();
      });
    });

    it("honours a custom duration", async () => {
      renderToast({ title: "Evento salvo", duration: 1000 });
      await fire();
      await screen.findByRole("button", { name: "Fechar notificação" });
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Fechar notificação" }),
        ).not.toBeInTheDocument();
      });
    });

    it("stays while the pointer is over it", async () => {
      renderToast({ title: "Evento salvo" });
      await fire();
      const close = await screen.findByRole("button", { name: "Fechar notificação" });
      await userEvent.hover(close);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByRole("button", { name: "Fechar notificação" })).toBeInTheDocument();
    });
  });

  it("puts no inline style in the server HTML, which the strict CSP would block", () => {
    const html = renderToString(
      <ToastProvider>
        <p>página</p>
      </ToastProvider>,
    );
    expect(html).toContain("página");
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("refuses to be used outside its provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger options={{ title: "x" }} />)).toThrow(/ToastProvider/);
    error.mockRestore();
  });
});
