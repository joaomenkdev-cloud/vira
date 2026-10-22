import { Footer, FooterLink, FooterLinks, FooterNotice } from "@vira/ui";
import Link from "next/link";

const REPOSITORY_URL = "https://github.com/joaomenkdev-cloud/vira";

export function SiteFooter() {
  return (
    <Footer>
      <FooterNotice>Pagamentos em modo de teste: nenhuma cobrança real é feita.</FooterNotice>
      <FooterLinks>
        <FooterLink asChild>
          <Link href="/privacidade">Política de privacidade</Link>
        </FooterLink>
        <FooterLink href={REPOSITORY_URL}>Código aberto (MIT) no GitHub</FooterLink>
      </FooterLinks>
    </Footer>
  );
}
