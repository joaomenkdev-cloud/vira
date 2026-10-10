import { Footer, FooterLink, FooterNotice } from "@vira/ui";

const REPOSITORY_URL = "https://github.com/joaomenkdev-cloud/vira";

export function SiteFooter() {
  return (
    <Footer>
      <FooterNotice>Pagamentos em modo de teste: nenhuma cobrança real é feita.</FooterNotice>
      <FooterNotice>
        Projeto de código aberto (MIT). <FooterLink href={REPOSITORY_URL}>Ver no GitHub</FooterLink>
      </FooterNotice>
    </Footer>
  );
}
