import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Modal, ModalClose, ModalContent, ModalTrigger } from "./modal";

function Example({
  onConfirm,
  size,
  withDescription = true,
}: {
  onConfirm?: () => void;
  size?: "sm" | "md";
  withDescription?: boolean;
}) {
  return (
    <>
      <button type="button">Antes</button>
      <Modal>
        <ModalTrigger asChild>
          <Button variant="danger">Excluir evento</Button>
        </ModalTrigger>
        <ModalContent
          title="Excluir este evento?"
          {...(withDescription ? { description: "Esta ação não pode ser desfeita." } : {})}
          {...(size ? { size } : {})}
          footer={
            <>
              <ModalClose asChild>
                <Button variant="secondary">Cancelar</Button>
              </ModalClose>
              <Button variant="danger" onClick={onConfirm}>
                Excluir
              </Button>
            </>
          }
        >
          <p>O evento e seus ingressos deixam de aparecer.</p>
        </ModalContent>
      </Modal>
      <button type="button">Depois</button>
    </>
  );
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "Excluir evento" }));
  return screen.findByRole("dialog");
}

describe("Modal", () => {
  it("is closed until it is opened", () => {
    render(<Example />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a dialog named by its title and described by its description", async () => {
    render(<Example />);
    const dialog = await open();
    expect(dialog).toHaveAccessibleName("Excluir este evento?");
    expect(dialog).toHaveAccessibleDescription("Esta ação não pode ser desfeita.");
    expect(screen.getByRole("heading", { name: "Excluir este evento?" })).toBeInTheDocument();
  });

  it("renders without a description", async () => {
    render(<Example withDescription={false} />);
    const dialog = await open();
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("puts the focus inside, on the content rather than on the exit", async () => {
    render(<Example />);
    const dialog = await open();
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Fechar" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("traps the focus: Tab and Shift+Tab never leave the dialog", async () => {
    render(<Example />);
    const dialog = await open();

    for (let step = 0; step < 6; step += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let step = 0; step < 6; step += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("closes with Esc and gives the focus back to the control that opened it", async () => {
    render(<Example />);
    await open();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Excluir evento" })).toHaveFocus();
  });

  it("closes with the × button, labelled for assistive technology", async () => {
    render(<Example />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes through a ModalClose action", async () => {
    render(<Example />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("runs the confirmation", async () => {
    const onConfirm = vi.fn();
    render(<Example onConfirm={onConfirm} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("hides the page behind it from assistive technology", async () => {
    render(<Example />);
    await open();
    expect(screen.queryByRole("button", { name: "Antes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Depois" })).not.toBeInTheDocument();
  });

  it("does not let the page behind it scroll", async () => {
    render(<Example />);
    await open();
    expect(document.body).toHaveAttribute("data-scroll-locked");
  });

  it("is a card of 480 px, or 640 px for content", async () => {
    const { unmount } = render(<Example />);
    expect(await open()).toHaveClass("sm:max-w-dialog");
    unmount();

    render(<Example size="md" />);
    expect(await open()).toHaveClass("sm:max-w-dialog-wide");
  });

  it("is a bottom sheet on a phone: glued to the bottom, rounded on top, with a handle", async () => {
    render(<Example />);
    const dialog = await open();
    expect(dialog).toHaveClass("bottom-0", "inset-x-0", "rounded-t-lg", "sm:rounded-lg");
    expect(dialog.querySelector("span.sm\\:hidden")).toHaveAttribute("aria-hidden", "true");
  });

  it("stacks the actions with the primary on top on a phone, and on the right from 640 px", async () => {
    render(<Example />);
    const dialog = await open();
    const actions = screen.getByRole("button", { name: "Excluir" }).parentElement;
    expect(actions).toHaveClass("flex-col-reverse", "sm:flex-row", "sm:justify-end");
    expect(dialog.contains(actions)).toBe(true);
    // The primary action is last in the DOM, so it ends up on the right.
    expect(actions?.lastElementChild).toBe(screen.getByRole("button", { name: "Excluir" }));
  });

  it("floats on the one shadow of the design system", async () => {
    render(<Example />);
    expect(await open()).toHaveClass("shadow-float", "z-modal");
  });
});
