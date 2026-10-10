import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./button";
import { Footer, FooterLink, FooterLinks, FooterNotice } from "./footer";
import { Header, HeaderActions, HeaderLogo, HeaderNav, HeaderNavLink } from "./header";

function setScroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

afterEach(() => {
  setScroll(0);
});

describe("Header", () => {
  it("is a banner, 56 px on a phone and 64 px from 768 px, stuck to the top", () => {
    render(
      <Header>
        <HeaderLogo href="/" aria-label="Vira, página inicial" />
      </Header>,
    );
    const banner = screen.getByRole("banner");
    expect(banner).toHaveClass("sticky", "top-0", "z-sticky", "bg-bg");
    expect(banner.firstElementChild).toHaveClass("h-14", "md:h-16");
  });

  it("hides its bottom border at rest and shows it after the page scrolls", () => {
    render(
      <Header>
        <HeaderLogo href="/" aria-label="Vira, página inicial" />
      </Header>,
    );
    const banner = screen.getByRole("banner");
    expect(banner).not.toHaveAttribute("data-scrolled");
    expect(banner).toHaveClass("border-transparent", "data-[scrolled]:border-line");

    setScroll(40);
    expect(banner).toHaveAttribute("data-scrolled");

    setScroll(0);
    expect(banner).not.toHaveAttribute("data-scrolled");
  });

  describe("logo", () => {
    it("is a link home, named by its label", () => {
      render(
        <Header>
          <HeaderLogo href="/" aria-label="Vira, página inicial" />
        </Header>,
      );
      expect(screen.getByRole("link", { name: "Vira, página inicial" })).toHaveAttribute(
        "href",
        "/",
      );
    });

    it("draws the word mark, with the red dot as decoration", () => {
      render(
        <Header>
          <HeaderLogo href="/" aria-label="Vira, página inicial" />
        </Header>,
      );
      const logo = screen.getByRole("link");
      expect(logo).toHaveTextContent("vira");
      expect(logo).toHaveClass("text-logo");
      expect(logo.querySelector("[aria-hidden='true']")).toHaveClass("bg-accent", "rounded-full");
    });

    it("draws the word mark inside the framework link", () => {
      render(
        <Header>
          <HeaderLogo asChild>
            <a href="/inicio" aria-label="Vira, página inicial" />
          </HeaderLogo>
        </Header>,
      );
      const logo = screen.getByRole("link", { name: "Vira, página inicial" });
      expect(logo).toHaveAttribute("href", "/inicio");
      expect(logo).toHaveTextContent("vira");
    });

    it("has a 44 px target", () => {
      render(
        <Header>
          <HeaderLogo href="/" aria-label="Vira" />
        </Header>,
      );
      expect(screen.getByRole("link")).toHaveClass("min-h-11");
    });
  });

  describe("navigation", () => {
    function WithNav() {
      return (
        <Header>
          <HeaderLogo href="/" aria-label="Vira, página inicial" />
          <HeaderNav>
            <HeaderNavLink href="/eventos" current>
              Explorar
            </HeaderNavLink>
            <HeaderNavLink href="/ingressos">Meus ingressos</HeaderNavLink>
          </HeaderNav>
          <HeaderActions>
            <Button size="sm" variant="secondary">
              Entrar
            </Button>
          </HeaderActions>
        </Header>
      );
    }

    it("is a labelled navigation landmark", () => {
      render(<WithNav />);
      const nav = screen.getByRole("navigation", { name: "Principal" });
      expect(nav).toHaveClass("hidden", "md:flex");
    });

    it("marks the current page for assistive technology and underlines it in red", () => {
      render(<WithNav />);
      const current = screen.getByRole("link", { name: "Explorar" });
      expect(current).toHaveAttribute("aria-current", "page");
      expect(current).toHaveClass("border-b-2", "border-accent");

      const other = screen.getByRole("link", { name: "Meus ingressos" });
      expect(other).not.toHaveAttribute("aria-current");
      expect(other).toHaveClass("border-transparent", "hover:border-line-strong");
    });

    it("keeps the logo, the links and the actions in reading order", () => {
      render(<WithNav />);
      const order = [...document.querySelectorAll("a, button")].map((element) =>
        element.tagName === "BUTTON" ? "button" : element.textContent,
      );
      expect(order).toEqual(["vira", "Explorar", "Meus ingressos", "button"]);
    });

    it("pushes the actions to the right", () => {
      render(<WithNav />);
      expect(screen.getByRole("button", { name: "Entrar" }).parentElement).toHaveClass("ml-auto");
    });

    it("lets a framework link wear the style", () => {
      render(
        <HeaderNavLink asChild current>
          <a href="/eventos">Explorar</a>
        </HeaderNavLink>,
      );
      expect(screen.getByRole("link", { name: "Explorar" })).toHaveClass("border-accent");
    });
  });
});

describe("Footer", () => {
  function Example() {
    return (
      <Footer>
        <FooterNotice>Pagamentos em modo de teste: nenhuma cobrança real é feita.</FooterNotice>
        <FooterLinks>
          <FooterLink href="/privacidade">Privacidade</FooterLink>
          <FooterLink href="/termos">Termos</FooterLink>
        </FooterLinks>
      </Footer>
    );
  }

  it("is a contentinfo landmark with a quiet notice", () => {
    render(<Example />);
    expect(screen.getByRole("contentinfo")).toHaveClass("border-t", "border-line");
    expect(screen.getByText(/Pagamentos em modo de teste/)).toBeInTheDocument();
  });

  it("lists its links", () => {
    render(<Example />);
    const list = screen.getByRole("list");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(list).toContainElement(screen.getByRole("link", { name: "Privacidade" }));
  });

  it("gives every link a 44 px target and an underline", () => {
    render(<Example />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-11", "underline");
    }
  });

  it("puts one link in a list without breaking it", () => {
    render(
      <Footer>
        <FooterLinks>
          <FooterLink href="/privacidade">Privacidade</FooterLink>
        </FooterLinks>
      </Footer>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("sets its text in body-sm ink-muted", () => {
    render(<Example />);
    expect(screen.getByText(/Pagamentos/).parentElement).toHaveClass(
      "text-body-sm",
      "text-ink-muted",
    );
  });
});
