import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Que dados a Vira guarda, para quê, por quanto tempo e com quem, e como baixar ou apagar os seus.",
};

/** When this text last changed; it follows docs/PRIVACY.md, which is the reference. */
const UPDATED_AT = { iso: "2026-10-22", label: "22 de outubro de 2026" };

interface DataItem {
  what: string;
  why: string;
  howLong: string;
}

const DATA: readonly DataItem[] = [
  {
    what: "Seu nome e seu e-mail",
    why: "Identificar sua conta, entrar, receber os ingressos e os avisos da conta.",
    howLong: "Enquanto a conta existir. Apagados quando você exclui a conta.",
  },
  {
    what: "Sua senha",
    why: "Entrar na conta. Guardamos só um resumo criptográfico (argon2id), nunca a senha.",
    howLong: "Enquanto a conta existir.",
  },
  {
    what: "O id da sua conta no Google ou no GitHub",
    why: "Entrar com essas contas, se você escolher.",
    howLong: "Enquanto o vínculo existir. Apagado quando você exclui a conta.",
  },
  {
    what: "Nome e e-mail do comprador no pedido",
    why: "Comprovante, envio dos ingressos, suporte e contestação de pagamento.",
    howLong: "5 anos depois da compra, ou até você excluir a conta.",
  },
  {
    what: "Nome do titular de cada ingresso",
    why: "Conferir quem entra no evento. O organizador vê esse nome só na entrada.",
    howLong: "Até 90 dias depois do evento.",
  },
  {
    what: "Nome público do organizador",
    why: "Mostrar quem organiza cada evento.",
    howLong: "Enquanto a conta existir.",
  },
  {
    what: "Leituras de ingresso na entrada",
    why: "Deixar cada ingresso entrar uma vez só e evitar fraude.",
    howLong: "Até 90 dias depois do evento.",
  },
  {
    what: "Sessões abertas",
    why: "Manter você na conta e mostrar onde ela está aberta.",
    howLong: "Até 30 dias depois de expirarem.",
  },
  {
    what: "Registro de ações sensíveis (só com o id da conta)",
    why: "Segurança: provar quem fez o quê, como trocar a senha ou excluir a conta.",
    howLong: "5 anos.",
  },
];

const PARTNERS: readonly { name: string; role: string; receives: string }[] = [
  {
    name: "Stripe",
    role: "Pagamentos (em modo de teste nesta demonstração)",
    receives: "Os dados do cartão, digitados direto no Stripe. A Vira nunca os vê.",
  },
  { name: "Resend", role: "Envio de e-mails", receives: "Seu nome, seu e-mail e a mensagem." },
  {
    name: "Neon e Upstash",
    role: "Banco de dados e filas",
    receives: "Os dados acima, guardados para a Vira.",
  },
  { name: "Vercel e Render", role: "Hospedagem do site e da API", receives: "O tráfego do site." },
  {
    name: "Google e GitHub",
    role: "Entrar com essas contas",
    receives: "Só o fato de que você entrou na Vira.",
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h2-sm md:text-h2">{title}</h2>
      {children}
    </section>
  );
}

const linkClass = "text-ink underline underline-offset-4";

export default function PrivacyPage() {
  return (
    <article className="mx-auto flex w-full max-w-reading flex-col gap-12 px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <header className="flex flex-col gap-4">
        <h1 className="text-h1-sm md:text-h1">Política de privacidade</h1>
        <p className="text-body-lg text-ink-muted">
          A Vira pede o mínimo: seu nome e seu e-mail. Não pedimos CPF, telefone, endereço nem data
          de nascimento, e não usamos cookies de propaganda ou de análise.
        </p>
        <p className="text-body-sm text-ink-muted">
          Última atualização: <time dateTime={UPDATED_AT.iso}>{UPDATED_AT.label}</time>
        </p>
      </header>

      <Section title="O que guardamos, para quê e por quanto tempo">
        <dl className="flex flex-col divide-y divide-line border-y border-line">
          {DATA.map((item) => (
            <div key={item.what} className="flex flex-col gap-1 py-4">
              <dt className="text-body font-semibold">{item.what}</dt>
              <dd className="text-body text-ink-muted">{item.why}</dd>
              <dd className="text-body-sm">Por quanto tempo: {item.howLong}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body text-ink-muted">
          Quando o prazo acaba, o dado é apagado ou trocado por um texto que não identifica ninguém
          (como “Titular removido”), automaticamente.
        </p>
      </Section>

      <Section title="Com quem compartilhamos">
        <ul role="list" className="flex flex-col gap-3">
          {PARTNERS.map((partner) => (
            <li key={partner.name} className="text-body">
              <span className="font-semibold">{partner.name}</span>
              <span className="text-ink-muted">
                {" "}
                · {partner.role}. {partner.receives}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-body text-ink-muted">
          Alguns desses serviços ficam fora do Brasil. Nenhum deles recebe seus dados para fazer
          propaganda.
        </p>
      </Section>

      <Section title="Seus direitos">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
          <li>
            <span className="font-semibold">Ver e levar seus dados:</span> em{" "}
            <Link href="/conta#privacidade" className={linkClass}>
              Minha conta → Privacidade
            </Link>
            , “Baixar meus dados” entrega um arquivo com tudo o que guardamos sobre você.
          </li>
          <li>
            <span className="font-semibold">Corrigir:</span> seu nome e seu e-mail mudam em{" "}
            <Link href="/conta" className={linkClass}>
              Minha conta
            </Link>
            .
          </li>
          <li>
            <span className="font-semibold">Apagar:</span> “Excluir minha conta”, em Minha conta →
            Privacidade, apaga seu nome e seu e-mail de tudo, encerra suas sessões e cancela os
            ingressos de eventos que ainda vão acontecer. Os registros de pagamento continuam, sem
            dizer de quem eram, porque a lei pede que sejam guardados.
          </li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p className="text-body">
          Só os necessários para manter você na conta e proteger os formulários. Por isso não há
          aviso de cookies: não há nada para recusar.
        </p>
      </Section>

      <Section title="Fale com a gente">
        <p className="text-body">
          A Vira é um projeto de código aberto, de portfólio. Os pagamentos são de teste e nenhuma
          cobrança real é feita. Para qualquer pedido sobre seus dados, fale com a pessoa
          responsável pelo projeto pelo{" "}
          <a href="https://github.com/joaomenkdev-cloud" className={linkClass}>
            perfil no GitHub
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
