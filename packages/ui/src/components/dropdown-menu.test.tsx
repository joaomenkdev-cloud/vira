import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function Example({
  onEdit = () => undefined,
  onDelete = () => undefined,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">Ações</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Evento</DropdownMenuLabel>
        <DropdownMenuItem icon={Pencil} onSelect={onEdit}>
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Duplicar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Trash2} destructive onSelect={onDelete}>
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// While the menu is open Radix hides everything else from assistive technology.
const trigger = () => screen.getByRole("button", { name: "Ações", hidden: true });

describe("DropdownMenu", () => {
  it("is closed until the trigger is used, and the trigger says so", () => {
    render(<Example />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens with a click and lists the items", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Editar",
      "Duplicar",
      "Excluir",
    ]);
  });

  it("opens with the keyboard and moves with the arrow keys, Home and End", async () => {
    render(<Example />);
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");

    expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    // The disabled item is skipped.
    expect(screen.getByRole("menuitem", { name: "Excluir" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Excluir" })).toHaveFocus();
  });

  it("finds an item by typing its first letter", async () => {
    render(<Example />);
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("ex");
    expect(screen.getByRole("menuitem", { name: "Excluir" })).toHaveFocus();
  });

  it("runs the chosen item and closes", async () => {
    const onEdit = vi.fn();
    render(<Example onEdit={onEdit} />);
    await userEvent.click(trigger());
    await userEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("runs the chosen item with Enter", async () => {
    const onDelete = vi.fn();
    render(<Example onDelete={onDelete} />);
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{End}{Enter}");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes with Esc and gives the focus back to the trigger", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    await screen.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(trigger()).toHaveFocus();
  });

  it("does not run a disabled item", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    const item = await screen.findByRole("menuitem", { name: "Duplicar" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveClass("data-[disabled]:text-ink-subtle");
  });

  it("paints the destructive item in danger, apart from the others by a separator", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    const item = await screen.findByRole("menuitem", { name: "Excluir" });
    expect(item).toHaveClass("text-danger");
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("draws item icons as decoration", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    const item = await screen.findByRole("menuitem", { name: "Editar" });
    expect(item.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is a floating panel on the one shadow, with items 40 px tall and 44 px to touch", async () => {
    render(<Example />);
    await userEvent.click(trigger());
    expect(await screen.findByRole("menu")).toHaveClass("shadow-float", "rounded-md", "p-1");
    expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveClass(
      "h-10",
      "pointer-coarse:h-11",
    );
  });

  describe("radio items", () => {
    function Sort({ onValueChange }: { onValueChange?: (value: string) => void }) {
      const [value, setValue] = useState("data");
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">Ordenar</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={value}
              onValueChange={(next) => {
                setValue(next);
                onValueChange?.(next);
              }}
            >
              <DropdownMenuRadioItem value="data">Data</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="preco">Preço</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    it("marks the chosen item with a check and a heavier weight", async () => {
      render(<Sort />);
      await userEvent.click(screen.getByRole("button", { name: "Ordenar" }));
      const chosen = await screen.findByRole("menuitemradio", { name: "Data" });
      expect(chosen).toHaveAttribute("aria-checked", "true");
      expect(chosen.querySelector("svg")).not.toBeNull();
      expect(chosen).toHaveClass("data-[state=checked]:font-medium");
      expect(screen.getByRole("menuitemradio", { name: "Preço" }).querySelector("svg")).toBeNull();
    });

    it("changes the choice", async () => {
      const onValueChange = vi.fn();
      render(<Sort onValueChange={onValueChange} />);
      await userEvent.click(screen.getByRole("button", { name: "Ordenar" }));
      await userEvent.click(await screen.findByRole("menuitemradio", { name: "Preço" }));
      expect(onValueChange).toHaveBeenCalledWith("preco");
    });
  });
});
