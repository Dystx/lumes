// Privacy policy (GDPR Article 13 compliant).
//
// Required because:
//  - The site collects IP addresses via standard HTTP logs
//  - If community reports are enabled, user-submitted coordinates
//    and optionally reporter names are stored
//  - Cookies are set by Cloudflare for DDoS protection (technical,
//    exempt from ePrivacy consent per Recital 32)
//
// This is a draft for review by a legal professional. Update the
// contact email and the data-controller identity before going live.

import { PublicPageShell } from "@/components/public/public-page-shell";

export const metadata = {
  title: "Política de Privacidade — lumes.pt",
  description: "Como o lumes.pt recolhe, processa e protege os seus dados pessoais.",
};

export default function PrivacyPage() {
  const lastUpdated = "2026-07-01";
  return (
    <PublicPageShell title="Política de Privacidade">
      <article className="max-w-[75ch] text-[var(--ember-text-muted)] leading-7 [&_h2]:text-[var(--ember-text)] [&_h2]:leading-tight [&_a]:text-[var(--ember-accent)] [&_a]:underline [&_strong]:text-[var(--ember-text)]">
        <p className="text-sm text-[var(--ember-text-faint)] mb-8">
          Última atualização: {lastUpdated}
        </p>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">1. Responsável pelo tratamento</h2>
          <p>
            O responsável pelo tratamento dos dados recolhidos através
            deste sítio é a equipa do projeto lumes.pt, contactável
            através de <a href="mailto:contact@lumes.pt">contact@lumes.pt</a>.
            Para questões específicas sobre proteção de dados,
            escreva para <a href="mailto:privacy@lumes.pt">privacy@lumes.pt</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">2. Dados que recolhemos</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Endereço IP</strong> — registado em todos os pedidos
              HTTP para fins de segurança, rate-limiting e prevenção de abuso.
              Retido por 30 dias.
            </li>
            <li>
              <strong>Cabeçalhos HTTP padrão</strong> (User-Agent, Referer,
              Accept-Language) — registados em conjunto com o IP para análise
              de tráfego agregada.
            </li>
            <li>
              <strong>Relatos da comunidade</strong> — se submeter um relato
              (tipo de ocorrência, coordenadas opcionais, descrição, nome
              opcional), estes dados são armazenados no servidor e podem ser
              apresentados publicamente no mapa após revisão.
            </li>
            <li>
              <strong>Incidentes seguidos</strong> — se subscrever alertas para
              um incêndio específico, é armazenado um identificador anónimo.
              Pode ser removido a qualquer momento.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">3. Finalidades e bases legais</h2>
          <p>
            Os dados acima são recolhidos e processados com as seguintes
            finalidades:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Segurança do serviço</strong> (base legal: interesse
              legítimo, Art. 6.º, n.º 1, alínea f) do RGPD) — proteção
              contra abuso, DDoS e acessos não autorizados.
            </li>
            <li>
              <strong>Funcionamento do serviço</strong> (base legal:
              execução de contrato / interesse legítimo) — entrega de
              dados de incêndios solicitados pelo utilizador.
            </li>
            <li>
              <strong>Comunicação de alertas</strong> (base legal:
              consentimento, Art. 6.º, n.º 1, alínea a) do RGPD) — só
              após subscrição explícita.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">4. Cookies e tecnologias semelhantes</h2>
          <p>
            Este sítio utiliza apenas cookies estritamente necessários:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Cloudflare</strong> — cookies de segurança
              (__cf_bm, __cflb) para distinguir humanos de bots e
              mitigar DDoS. Considerados técnicos, dispensam consentimento
              prévio ao abrigo do Considerando 32 da Diretiva ePrivacy.
            </li>
            <li>
              <strong>Cloudflare Web Analytics</strong> — beacon
              javascript sem cookies, agregado, sem identificação
              individual.
            </li>
          </ul>
          <p>
            Não usamos cookies de publicidade, marketing ou tracking
            entre sítios. Se vier a introduzir Google Analytics, Matomo
            ou semelhante, esta página será atualizada e o consentimento
            será solicitado.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">5. Partilha de dados</h2>
          <p>
            Não vendemos nem alugamos dados pessoais a terceiros. Os dados
            podem ser comunicados a autoridades judiciais no âmbito de
            obrigação legal ou a fornecedores de infraestrutura (alojamento,
            DNS, CDN) estritamente para fins de operação do serviço.
          </p>
          <p>
            Os dados de incidentes visíveis publicamente no mapa são
            oriundos de fontes oficiais (ANEPC, IPMA, NASA FIRMS) e de
            relatos validados submetidos por utilizadores. Não incluem
            informação pessoal identificável.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">
            6. Onde armazenamos os dados & transferência internacional
          </h2>
          <p>
            Os dados são armazenados em servidores na União Europeia
            (atualmente Áustria / Alemanha). Os fornecedores de CDN e DNS
            podem rotear tráfego através de pontos de presença globais
            (Cloudflare), mas o armazenamento persistente está em jurisdição
            EU. Não há transferência internacional de dados pessoais para
            países terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">7. Retenção</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Logs de acesso: 30 dias, depois eliminados.</li>
            <li>Relatos da comunidade: enquanto o incêndio estiver ativo ou 90 dias, o que for maior.</li>
            <li>Incidentes seguidos: até remover a subscrição.</li>
            <li>Ocorrências históricas: anonimizadas após 5 anos.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">8. Os seus direitos</h2>
          <p>
            Nos termos do RGPD, tem direito a:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Acesso aos dados que lhe dizem respeito (Art. 15.º)</li>
            <li>Retificação de dados inexatos (Art. 16.º)</li>
            <li>Apagamento / direito a ser esquecido (Art. 17.º)</li>
            <li>Limitação do tratamento (Art. 18.º)</li>
            <li>Portabilidade dos dados (Art. 20.º)</li>
            <li>Oposição ao tratamento (Art. 21.º)</li>
            <li>Retirada do consentimento (Art. 7.º, n.º 3)</li>
            <li>Reclamação à CNPD — Comissão Nacional de Proteção de Dados (https://www.cnpd.pt)</li>
          </ul>
          <p>
            Para exercer qualquer destes direitos, contacte
            <a href="mailto:privacy@lumes.pt"> privacy@lumes.pt</a>.
            Responderemos no prazo de 30 dias.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">9. Encarregado de proteção de dados (DPO)</h2>
          <p>
            A lumes.pt é operada por uma equipa pequena. Para questões
            formais de proteção de dados que exijam um DPO nomeado,
            contacte <a href="mailto:dpo@lumes.pt">dpo@lumes.pt</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-3">10. Alterações a esta política</h2>
          <p>
            Se alterarmos esta política de forma material (por exemplo,
            se começarmos a recolher novos tipos de dados), colocaremos
            um aviso visível na página inicial durante 30 dias antes
            da alteração entrar em vigor.
          </p>
        </section>

        <p className="text-xs text-[var(--ember-text-faint)] mt-12">
          Este texto é um rascunho para revisão por profissional jurídico
          antes de publicação definitiva.
        </p>
      </article>
    </PublicPageShell>
  );
}
