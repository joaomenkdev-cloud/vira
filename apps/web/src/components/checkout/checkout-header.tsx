import Link from "next/link";
import { Lock } from "lucide-react";
import { Header, HeaderActions, HeaderLogo, Icon } from "@vira/ui";

/** The logo and "Pagamento seguro": the checkout's header (docs/DESIGN.md, 4.3). */
export function CheckoutHeader() {
  return (
    <Header>
      <HeaderLogo asChild>
        <Link href="/" aria-label="Vira, página inicial" />
      </HeaderLogo>
      <HeaderActions>
        <p className="flex items-center gap-2 text-body-sm text-ink-muted">
          <Icon icon={Lock} size={16} />
          Pagamento seguro
        </p>
      </HeaderActions>
    </Header>
  );
}
