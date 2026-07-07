// Newsletter signup page. Posts to /api/newsletter/subscribe.
//
// Opt-in pattern (GDPR-compliant):
//   1. User submits email
//   2. Server creates row with `confirmedAt = null` + a unique token
//   3. Server sends an email with a confirmation link
//   4. User clicks the link → /api/newsletter/confirm?token=...
//   5. Server sets `confirmedAt = now()`
//   6. Future newsletters go only to confirmed subscribers

export const metadata = {
  title: "Newsletter — lumes.pt",
  description:
    "Subscreva a newsletter do lumes.pt para receber alertas por email em caso de incêndios relevantes na sua região.",
};

export default function NewsletterPage() {
  return (
    <main className="min-h-screen bg-[var(--ember-bg)] text-[var(--ember-text)]">
      <div className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold mb-2">Newsletter lumes.pt</h1>
        <p className="text-sm text-[var(--ember-text-muted)] mb-8">
          Receba um email quando um incêndio relevante for detetado na sua
          região ou em qualquer município que siga. Pode cancelar a qualquer
          momento.
        </p>

        <form
          action="/api/newsletter/subscribe"
          method="POST"
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-sm text-[var(--ember-text-muted)] mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autoComplete="email"
              placeholder="seu.email@example.com"
              className="w-full px-3 py-2 bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-md text-[var(--ember-text)] placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div>
            <label htmlFor="locale" className="block text-sm text-[var(--ember-text-muted)] mb-1">
              Idioma
            </label>
            <select
              id="locale"
              name="locale"
              defaultValue="pt-PT"
              className="w-full px-3 py-2 bg-[var(--ember-surface)] border border-[var(--ember-border)] rounded-md text-[var(--ember-text)]"
            >
              <option value="pt-PT">Português (PT)</option>
              <option value="en-US">English</option>
            </select>
          </div>

          <div className="text-xs text-[var(--ember-text-faint)] border-t border-[var(--ember-border)] pt-4">
            Ao subscrever, concorda com a nossa{" "}
            <a href="/privacy" className="underline hover:text-[var(--ember-text-muted)]">
              política de privacidade
            </a>
            . Irá receber um email de confirmação antes de qualquer newsletter
            chegar.
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-[var(--ember-accent)] hover:bg-[var(--ember-accent-hover)] text-[var(--ember-bg)] font-semibold rounded-md transition-colors"
          >
            Subscrever
          </button>
        </form>

        <p className="text-xs text-[var(--ember-text-faint)] mt-8">
          Já subscreveu?{" "}
          <a href="/api/newsletter/unsubscribe" className="underline hover:text-[var(--ember-text-muted)]">
            Cancelar subscrição
          </a>
          .
        </p>
      </div>
    </main>
  );
}
