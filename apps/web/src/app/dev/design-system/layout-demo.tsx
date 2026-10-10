"use client";

import {
  Button,
  Footer,
  FooterLink,
  FooterLinks,
  FooterNotice,
  Header,
  HeaderActions,
  HeaderLogo,
  HeaderNav,
  HeaderNavLink,
  IconButton,
} from "@vira/ui";
import { Search } from "lucide-react";

import { ComponentSection, Group, StateLabel } from "./section";

/*
 * The real header of the app carries only the logo. These are the variations the design
 * system supports for when the pages they lead to exist; the links go nowhere on purpose.
 */
export function LayoutDemo() {
  return (
    <ComponentSection id="cabecalho-rodape" title="Header e footer">
      <Group title="Header: só o logo (o do app hoje)">
        <div className="overflow-hidden rounded-lg border border-line">
          <Header>
            <HeaderLogo href="#cabecalho-rodape" aria-label="Vira, página inicial" />
          </Header>
        </div>
      </Group>

      <Group title="Header: navegação e entrar">
        <div className="overflow-hidden rounded-lg border border-line">
          <Header>
            <HeaderLogo href="#cabecalho-rodape" aria-label="Vira, página inicial" />
            <HeaderNav>
              <HeaderNavLink href="#cabecalho-rodape" current>
                Explorar
              </HeaderNavLink>
              <HeaderNavLink href="#cabecalho-rodape">Meus ingressos</HeaderNavLink>
            </HeaderNav>
            <HeaderActions>
              <IconButton icon={Search} label="Buscar eventos" className="md:hidden" />
              <Button variant="secondary" size="sm">
                Entrar
              </Button>
            </HeaderActions>
          </Header>
        </div>
        <StateLabel>
          No celular a navegação some e fica só o logo, a busca e o botão de entrar. A borda de
          baixo aparece quando a página rola.
        </StateLabel>
      </Group>

      <Group title="Footer: completo">
        <div className="overflow-hidden rounded-lg border border-line">
          <Footer>
            <FooterNotice>Pagamentos em modo de teste: nenhuma cobrança real é feita.</FooterNotice>
            <FooterLinks>
              <FooterLink href="#cabecalho-rodape">Privacidade</FooterLink>
              <FooterLink href="#cabecalho-rodape">Termos</FooterLink>
              <FooterLink href="#cabecalho-rodape">GitHub</FooterLink>
            </FooterLinks>
          </Footer>
        </div>
      </Group>

      <Group title="Footer: o do app hoje">
        <div className="overflow-hidden rounded-lg border border-line">
          <Footer>
            <FooterNotice>Pagamentos em modo de teste: nenhuma cobrança real é feita.</FooterNotice>
            <FooterNotice>
              Projeto de código aberto (MIT).{" "}
              <FooterLink href="#cabecalho-rodape">Ver no GitHub</FooterLink>
            </FooterNotice>
          </Footer>
        </div>
      </Group>
    </ComponentSection>
  );
}
