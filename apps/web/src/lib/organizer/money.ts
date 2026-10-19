/*
 * Prices as the organizer types them, in reais with a decimal comma ("80", "80,00",
 * "1.250,50", "R$ 80,00"), and the whole cents the API takes.
 */

const PRICE = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** "1.250,5" → 125050. `null` when the text is not an amount in reais. */
export function parsePriceToCents(text: string): number | null {
  const match = PRICE.exec(text.trim());
  if (!match) return null;
  const reais = Number((match[1] ?? "").replaceAll(".", ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

const amountFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 125050 → "1.250,50": the amount as the price field shows it, without "R$". */
export function formatCents(cents: number): string {
  return amountFormat.format(cents / 100);
}
