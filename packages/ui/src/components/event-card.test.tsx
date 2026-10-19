import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EventCard, initialsOf } from "./event-card";

const base = {
  link: <a href="/eventos/forro-na-praca" />,
  title: "Forró na Praça",
  date: <time dateTime="2026-03-14T21:00:00-03:00">SÁB, 14 MAR · 21:00</time>,
  venue: "Casa de Shows · Recife",
};

describe("EventCard", () => {
  it("is an article whose title is the one link to the event", () => {
    render(<EventCard {...base} price="A partir de R$ 80,00" />);
    const article = screen.getByRole("article");
    const link = screen.getByRole("link", { name: "Forró na Praça" });
    expect(link).toHaveAttribute("href", "/eventos/forro-na-praca");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3, name: "Forró na Praça" })).toContainElement(
      link,
    );
    // The link's hit area is stretched over the card, which draws the focus ring.
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(article).toHaveClass("relative", "has-[a:focus-visible]:outline-accent");
  });

  it("reads in the order of the design: photo, date, name, place, price", () => {
    render(
      <EventCard
        {...base}
        price="A partir de R$ 80,00"
        image={<img src="/x.webp" alt="Palco iluminado" />}
      />,
    );
    const text = screen.getByRole("article").textContent;
    expect(text).toBe(
      "SÁB, 14 MAR · 21:00Forró na PraçaCasa de Shows · RecifeA partir de R$ 80,00",
    );
    expect(screen.getByRole("img", { name: "Palco iluminado" })).toBeInTheDocument();
  });

  it("paints only the date in the accent colour", () => {
    const { container } = render(<EventCard {...base} price="A partir de R$ 80,00" />);
    const red = container.querySelectorAll("[class*='text-accent']");
    expect(red).toHaveLength(1);
    expect(red[0]).toHaveTextContent("SÁB, 14 MAR · 21:00");
  });

  it("leaves the price line out when there is no price, never R$ 0,00", () => {
    render(<EventCard {...base} price={null} />);
    expect(screen.getByRole("article")).not.toHaveTextContent("R$");
  });

  it("shows one status badge over the photo and the demonstration badge apart", () => {
    render(<EventCard {...base} status="Esgotado" isDemo />);
    expect(screen.getByText("Esgotado")).toHaveClass("bg-surface", "absolute");
    expect(screen.getByText("Demonstração")).toHaveClass("bg-surface-sunken");
  });

  it("draws the typographic placeholder without a photo: initials, no image", () => {
    const { container } = render(<EventCard {...base} />);
    expect(container.querySelector("img, svg")).toBeNull();
    const placeholder = container.querySelector("[aria-hidden='true']");
    expect(placeholder).toHaveTextContent("FN");
    expect(placeholder).toHaveClass("text-h1", "text-ink-muted");
  });

  it("keeps the photo in 3:2 and stops its zoom under reduced motion", () => {
    const { container } = render(<EventCard {...base} image={<img src="/x.webp" alt="" />} />);
    expect(container.querySelector(".aspect-card")).not.toBeNull();
    expect(container.querySelector(".group-hover\\:scale-103")).toHaveClass(
      "motion-reduce:group-hover:scale-100",
    );
  });

  it("can title itself with a level-2 heading", () => {
    render(<EventCard {...base} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Forró na Praça" })).toBeInTheDocument();
  });

  it("writes no inline style in the server HTML (CSP)", () => {
    expect(
      renderToString(<EventCard {...base} price="A partir de R$ 80,00" status="Esgotado" isDemo />),
    ).not.toMatch(/\sstyle=/);
  });
});

describe("initialsOf", () => {
  it.each([
    ["Forró na Praça", "FN"],
    ["  ópera   ", "Ó"],
    ["# 2026: Festival", "2F"],
    ["", ""],
  ])("%s → %s", (title, initials) => {
    expect(initialsOf(title)).toBe(initials);
  });
});
