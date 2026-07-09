// Email sending interface for the newsletter.
//
// The double-opt-in flow records subscribers in the DB and asks
// this module to send confirmation emails. In production this needs
// to be wired to a real provider — see the "MAIL PROVIDER" comment
// below — but defaults to a console.log so the rest of the app
// works locally.
//
// To enable real email sending, set one of:
//   - SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
//   - Or MAILGUN_API_KEY + MAILGUN_DOMAIN
//   - Or MAILERSEND_API_KEY
//   - etc.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  /** When running in stub mode, the URL the operator can paste into
   *  their browser to simulate the user clicking the link. */
  previewUrl?: string;
}

/** The local build deliberately has no delivery provider. Keep this explicit
 * so the API never claims a confirmation email was delivered by a stub. */
export function isEmailProviderConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM,
  ) || Boolean(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)
    || Boolean(process.env.MAILERSEND_API_KEY);
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  // ----- MAIL PROVIDER -----
  //
  // Replace this stub with real SMTP / Mailgun / MailerSend.
  //
  // Do not log recipients, message bodies, or confirmation links: these are
  // personal data and bearer-like tokens. A real provider integration should
  // expose delivery status through its own secure operator console.
  void msg;
  if (!isEmailProviderConfigured()) {
    return { ok: false, error: "email_provider_not_configured" };
  }
  // Provider adapters are intentionally not guessed here. A configured
  // provider must be wired explicitly before this returns success.
  return { ok: false, error: "email_provider_unavailable" };
}

export function buildConfirmationEmail(opts: {
  to: string;
  confirmUrl: string;
  locale?: string;
  ipSource?: string;
}): EmailMessage {
  const pt = (opts.locale ?? "pt-PT").startsWith("pt");

  if (pt) {
    return {
      to: opts.to,
      subject: "Confirme a sua subscrição da newsletter lumes.pt",
      text: [
        "Obrigado por subscrever a newsletter do lumes.pt.",
        "",
        "Para confirmar a sua subscrição e começar a receber alertas,",
        "clique no link abaixo:",
        "",
        opts.confirmUrl,
        "",
        "Se não subscreveu, ignore este email.",
        "",
        "lumes.pt — equipa",
      ].join("\n"),
    };
  }

  return {
    to: opts.to,
    subject: "Confirm your lumes.pt newsletter subscription",
    text: [
      "Thanks for subscribing to lumes.pt.",
      "",
      "To confirm and start receiving alerts, click the link below:",
      "",
      opts.confirmUrl,
      "",
      "If you did not subscribe, ignore this email.",
      "",
      "lumes.pt team",
    ].join("\n"),
  };
}

export function buildUnsubscribeEmail(opts: {
  to: string;
  unsubscribeUrl: string;
  locale?: string;
}): EmailMessage {
  const pt = (opts.locale ?? "pt-PT").startsWith("pt");
  if (pt) {
    return {
      to: opts.to,
      subject: "A sua subscrição foi cancelada",
      text: [
        "A sua subscrição da newsletter do lumes.pt foi cancelada com sucesso.",
        "",
        `Se isto foi um erro, pode reativar em: ${opts.unsubscribeUrl}`,
        "",
        "lumes.pt — equipa",
      ].join("\n"),
    };
  }
  return {
    to: opts.to,
    subject: "Your subscription has been cancelled",
    text: [
      "Your lumes.pt newsletter subscription has been cancelled.",
      "",
      `If this was a mistake, you can re-subscribe at: ${opts.unsubscribeUrl}`,
      "",
      "lumes.pt team",
    ].join("\n"),
  };
}
