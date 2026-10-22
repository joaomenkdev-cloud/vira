import type { Page } from "@playwright/test";

/** The test card Stripe always declines (docs: "Testing"). */
export const DECLINED_CARD = "4000 0000 0000 0002";

/**
 * A stand-in for Stripe.js, served in place of js.stripe.com: the Payment Element is a
 * plain card field, and `confirmPayment` declines the declined test card and accepts any
 * other. Whether the order is paid is still up to the webhook (POST /__test/orders/pay).
 */
const STRIPE_STUB = `
window.Stripe = function Stripe(publishableKey) {
  if (!publishableKey.startsWith("pk_test_")) throw new Error("live key");
  let field = null;
  return {
    elements() {
      return {
        create() {
          return {
            mount(target) {
              const label = document.createElement("label");
              label.textContent = "Número do cartão";
              field = document.createElement("input");
              field.inputMode = "numeric";
              label.append(field);
              target.append(label);
            },
            destroy() {},
          };
        },
      };
    },
    async confirmPayment() {
      const card = (field && field.value) || "";
      if (card.replace(/\\s/g, "") === "${DECLINED_CARD.replaceAll(" ", "")}") {
        return { error: { type: "card_error", message: "Seu cartão foi recusado." } };
      }
      return { paymentIntent: { status: "succeeded" } };
    },
  };
};
`;

export async function stubStripe(page: Page): Promise<void> {
  await page.route("https://js.stripe.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: STRIPE_STUB }),
  );
}
