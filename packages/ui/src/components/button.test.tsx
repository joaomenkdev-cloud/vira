import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button, IconButton } from "./button";

describe("Button", () => {
  it("is a button of type button unless told otherwise", () => {
    render(<Button>Comprar ingresso</Button>);
    expect(screen.getByRole("button", { name: "Comprar ingresso" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("can submit a form", () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute("type", "submit");
  });

  it.each([
    ["primary", "bg-accent"],
    ["secondary", "border-line-strong"],
    ["ghost", "bg-transparent"],
    ["danger", "text-danger"],
    ["link", "underline"],
  ] as const)("renders the %s variant", (variant, className) => {
    render(<Button variant={variant}>Ação</Button>);
    expect(screen.getByRole("button")).toHaveClass(className);
  });

  it.each([
    ["sm", "h-9"],
    ["md", "h-11"],
    ["lg", "h-13"],
  ] as const)("renders the %s size", (size, className) => {
    render(<Button size={size}>Ação</Button>);
    expect(screen.getByRole("button")).toHaveClass(className);
  });

  it("styles hover and active, and never removes the focus ring", () => {
    render(<Button>Ação</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("hover:bg-accent-hover", "active:bg-accent-pressed");
    // The ring is global (:focus-visible); no component may switch it off.
    expect(button.className).not.toMatch(/outline-none|outline-hidden/);
  });

  it("runs the click handler", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ação</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is operable with the keyboard", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ação</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does nothing when disabled and looks disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Ação
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveClass("disabled:bg-surface-sunken", "disabled:text-ink-subtle");
  });

  describe("while loading", () => {
    it("is busy, shows the loading label and ignores clicks", async () => {
      const onClick = vi.fn();
      render(
        <Button loading loadingLabel="Processando…" onClick={onClick}>
          Pagar
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Processando…" });
      expect(button).toHaveAttribute("aria-busy", "true");
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("hides the idle label from assistive technology", () => {
      render(
        <Button loading loadingLabel="Processando…">
          Pagar
        </Button>,
      );
      expect(screen.getByText("Pagar")).toHaveAttribute("aria-hidden", "true");
    });

    it("keeps focus so a keyboard user does not lose their place", async () => {
      render(
        <Button loading loadingLabel="Processando…">
          Pagar
        </Button>,
      );
      await userEvent.tab();
      expect(screen.getByRole("button")).toHaveFocus();
    });

    it("does not submit the form", async () => {
      const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
        event.preventDefault();
      });
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" loading>
            Pagar
          </Button>
        </form>,
      );
      await userEvent.click(screen.getByRole("button"));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("keeps both labels in the DOM, one invisible, so the width never changes", () => {
      render(<Button loadingLabel="Processando pagamento…">Pagar</Button>);
      expect(screen.getByText("Processando pagamento…").closest("span.invisible")).not.toBeNull();
    });

    it("is not busy when idle", () => {
      render(<Button>Pagar</Button>);
      expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    });
  });

  it("draws the start icon as decoration", () => {
    render(<Button iconStart={Plus}>Criar evento</Button>);
    expect(
      screen.getByRole("button", { name: "Criar evento" }).querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("gives its look to a link", () => {
    render(
      <Button asChild>
        <a href="/eventos">Explorar eventos</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Explorar eventos" });
    expect(link).toHaveAttribute("href", "/eventos");
    expect(link).toHaveClass("bg-accent");
  });

  it("has no box of its own as a link variant", () => {
    render(<Button variant="link">Ver regras</Button>);
    expect(screen.getByRole("button").className).not.toMatch(/\bh-(9|11|13)\b/);
  });
});

describe("IconButton", () => {
  it("is named by its label", () => {
    render(<IconButton icon={Plus} label="Adicionar" />);
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeInTheDocument();
  });

  it.each([
    ["sm", "size-9"],
    ["md", "size-11"],
    ["lg", "size-13"],
  ] as const)("is square in the %s size", (size, className) => {
    render(<IconButton icon={Plus} label="Adicionar" size={size} />);
    expect(screen.getByRole("button")).toHaveClass(className);
  });

  it("shows its name in a tooltip on keyboard focus and hides it with Esc", async () => {
    render(<IconButton icon={Plus} label="Adicionar" />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Adicionar");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
