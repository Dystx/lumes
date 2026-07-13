"use client";

import { Play, Pause, SkipBack, SkipForward, Clock } from "@/components/icons/phosphor-icons";
import { t, type Language } from "@/lib/i18n";
import type { MapChromeInsets } from "@/lib/map-chrome";

interface PlaybackBarProps {
  hour: number;
  isPlaying: boolean;
  onSeek: (h: number) => void;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  lang: Language;
  chromeInsets?: Pick<MapChromeInsets, "bottom" | "right">;
}

export function PlaybackBar({
  hour,
  isPlaying,
  onSeek,
  onTogglePlay,
  onSkipBack,
  onSkipForward,
  lang,
  chromeInsets,
}: PlaybackBarProps) {
  // Map hour (-24..0) to percentage (0..100)
  const pct = ((hour + 24) / 24) * 100;

  // Compact "Discover playback" pill when at hour=0
  if (hour === 0 && !isPlaying) {
    return (
      <div className="absolute z-20" style={{ bottom: 16 + (chromeInsets?.bottom ?? 0), right: chromeInsets?.right ?? 12 }} data-testid="playback-bar" data-map-chrome-region="playback">
        <button
          onClick={onTogglePlay}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--ember-surface)]/90 backdrop-blur-md border border-[var(--ember-border)] hover:border-[var(--ember-accent)] transition-colors shadow-[var(--ember-shadow-sm)] text-[11px] text-[var(--ember-text-muted)] hover:text-[var(--ember-text)]"
          aria-label="Reproduzir histórico das últimas 24 horas"
          title="Reproduzir histórico"
        >
          <Play className="w-3 h-3 text-[var(--ember-accent)]" fill="currentColor" />
          <span className="font-medium">Reproduzir -24h</span>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-0 z-20 flex items-center px-3 lg:px-6 h-14 lg:h-20 bg-[var(--ember-bg)]/90 backdrop-blur-md border-t border-[var(--ember-border)]" style={{ bottom: chromeInsets?.bottom ?? 0, right: chromeInsets?.right ?? 0 }} data-testid="playback-bar" data-map-chrome-region="playback">
      <div className="flex items-center gap-2 lg:gap-3 pr-3 lg:pr-5 border-r border-[var(--ember-border)]">
        <button
          onClick={onSkipBack}
          className="text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
          aria-label={t(lang, "playback.skipBack")}
        >
          <SkipBack className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </button>
        <button
          onClick={onTogglePlay}
          className="w-7 h-7 md:w-8 md:h-8 rounded-md border border-[var(--ember-border)] bg-[var(--ember-surface)] text-[var(--ember-text)] flex items-center justify-center hover:bg-[var(--ember-surface-2)] transition-colors flex-shrink-0"
          aria-label={isPlaying ? (lang === "pt" ? "Pausar" : "Pause") : (lang === "pt" ? "Reproduzir" : "Play")}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 md:w-4 md:h-4" />
          ) : (
            <Play className="w-3.5 h-3.5 md:w-4 md:h-4 ml-0.5" fill="currentColor" />
          )}
        </button>
        <button
          onClick={onSkipForward}
          className="text-[var(--ember-text-muted)] hover:text-[var(--ember-text)] transition-colors"
          aria-label={t(lang, "playback.skipForward")}
        >
          <SkipForward className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 md:gap-1 ml-3 md:ml-5 min-w-0">
        <div className="flex justify-between text-meta uppercase tracking-wider text-[var(--ember-text-faint)]">
          <span className="hidden lg:flex items-center gap-1 font-medium">
            <Clock className="w-3 h-3" />
            {lang === "pt" ? "Reprodução Histórica" : "Historical Playback"}
          </span>
          <span className="lg:hidden font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {hour === 0 ? t(lang, "playback.now") : `T${hour}h`}
          </span>
          <span className="hidden md:inline font-mono text-[var(--ember-text-muted)]" aria-label={hour === 0 ? t(lang, "playback.nowLabel") : `${hour} horas atrás`}>
            {hour === 0 ? t(lang, "playback.now") : `T${hour}h`}
          </span>
        </div>
        <div className="relative h-1.5 bg-[var(--ember-surface-2)] rounded-full cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const newPct = Math.max(0, Math.min(100, (x / rect.width) * 100));
          const newHour = Math.round((newPct / 100) * 24) - 24;
          onSeek(Math.max(-24, Math.min(0, newHour)));
        }}>
          <div
            className="absolute top-0 left-0 h-1.5 bg-[var(--ember-accent)] rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--ember-accent)] border-2 border-[var(--ember-bg)] rounded-full shadow"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-meta text-[var(--ember-text-faint)] font-mono">
          <span>T-24h</span>
          <span>{t(lang, "playback.now")}</span>
        </div>
      </div>
    </div>
  );
}
