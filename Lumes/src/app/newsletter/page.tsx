import { NewsletterForm } from "@/components/public/newsletter-form";
import { PublicPageShell } from "@/components/public/public-page-shell";

export const metadata = {
  title: "Newsletter — lumes.pt",
  description:
    "Subscreva a newsletter do lumes.pt para receber alertas por email em caso de incêndios relevantes na sua região.",
};

export default function NewsletterPage() {
  return (
    <PublicPageShell
      title="Newsletter lumes.pt"
      description="Receba um email quando um incêndio relevante for detetado na sua região ou em qualquer município que siga. Pode cancelar a qualquer momento."
    >
      <NewsletterForm />
      <p className="mt-8 max-w-[65ch] text-xs leading-5 text-[var(--ember-text-faint)]">
        Já subscreveu? Para cancelar, use a ligação de cancelamento recebida por email ou contacte
        <a href="mailto:privacy@lumes.pt" className="ml-1 underline hover:text-[var(--ember-text-muted)]">privacy@lumes.pt</a>.
      </p>
    </PublicPageShell>
  );
}
