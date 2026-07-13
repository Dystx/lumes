"use client";

import { FormEvent, useState } from "react";
import { submitNewsletterSubscription } from "@/lib/newsletter-client";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function NewsletterForm() {
  const [state, setState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setState("error");
      setMessage("Introduza um endereço de email válido.");
      return;
    }
    setState("submitting");
    setMessage("");

    try {
      const locale = form.get("locale") === "en" ? "en" : "pt";
      const data = await submitNewsletterSubscription(email, locale);
      setState("success");
      setMessage(data.status === "already_subscribed"
        ? "Este email já está confirmado."
        : "Verifique o seu email para confirmar a subscrição.");
      formElement.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a subscrição.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-[var(--ember-text-muted)]">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          aria-invalid={state === "error"}
          autoComplete="email"
          placeholder="seu.email@example.com"
          className="min-h-11 w-full rounded-md border border-[var(--ember-border)] bg-[var(--ember-surface)] px-3 text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/30"
        />
      </div>
      <div>
        <label htmlFor="locale" className="mb-1 block text-sm text-[var(--ember-text-muted)]">Idioma</label>
        <select id="locale" name="locale" defaultValue="pt" className="min-h-11 w-full rounded-md border border-[var(--ember-border)] bg-[var(--ember-surface)] px-3 text-[var(--ember-text)]">
          <option value="pt">Português (PT)</option>
          <option value="en">English</option>
        </select>
      </div>
      <p className="border-t border-[var(--ember-border)] pt-4 text-xs leading-5 text-[var(--ember-text-faint)]">
        Ao subscrever, concorda com a nossa <a href="/privacy" className="underline hover:text-[var(--ember-text-muted)]">política de privacidade</a>. Irá receber um email de confirmação antes de qualquer newsletter.
      </p>
      {state !== "idle" && (
        <p role={state === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${state === "error" ? "border-[var(--ember-critical)]/30 bg-[var(--ember-critical-subtle)] text-[var(--ember-critical)]" : "border-[var(--ember-success)]/30 bg-[var(--ember-success-subtle)] text-[var(--ember-success)]"}`}>
          {state === "submitting" ? "A subscrever…" : message}
        </p>
      )}
      <button type="submit" disabled={state === "submitting"} className="min-h-11 w-full rounded-md bg-[var(--ember-accent)] px-4 font-semibold text-[var(--ember-bg)] transition-colors hover:bg-[var(--ember-accent-hover)] disabled:cursor-wait disabled:opacity-70">
        {state === "submitting" ? "A subscrever…" : "Subscrever"}
      </button>
    </form>
  );
}
