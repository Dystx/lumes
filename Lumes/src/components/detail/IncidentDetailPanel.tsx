"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { t, type Language } from "@/lib/i18n";
import { statusRawLabel } from "@/lib/incident";
import { useMatchedIncidentNews } from "@/lib/use-app-data";
import { OverlayDrawer } from "@/components/ui/overlay-drawer";
import {
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Users,
  Plane,
  Truck,
  Wind,
  Droplets,
  Thermometer,
  ExternalLink,
  Share2,
  Bookmark,
  Bell,
  Navigation,
  TrendingUp,
  Radio,
  AlertTriangle,
  Newspaper,
  Flame,
  Satellite,
} from "@/components/icons/phosphor-icons";
import {
  AnimatedButton,
  StaggerChildren,
  StaggerItem,
  Skeleton,
} from "@/components/ember-anim";
import {
  SAMPLE_INCIDENTS,
  type Incident,
  type IncidentStatus,
  type Severity,
  type SourceType,
  type TimelineEvent,
  type VerificationStatus,
} from "@/lib/sample-data";

function timeAgo(iso: string, lang: Language): string {
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (diffMinutes < 1) return lang === "pt" ? "agora" : "just now";
  if (diffMinutes < 60) return lang === "pt" ? `há ${diffMinutes} min` : `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return lang === "pt" ? `há ${hours} h` : `${hours}h ago`;
  return lang === "pt" ? `há ${Math.round(hours / 24)} d` : `${Math.round(hours / 24)}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const STATUS_LABEL: Record<IncidentStatus, string> = {
  detected: "Detected", active: "Active", contained: "Contained", resolved: "Resolved", monitoring: "Monitoring",
};
function sourceLabel(source: SourceType, lang: Language): string {
  return t(lang, `sourceTypes.${source}`) || source;
}
function verificationLabel(verification: VerificationStatus, lang: Language): string {
  return t(lang, `trust.${verification}`) || verification;
}
const SOURCE_ICON: Record<SourceType, typeof Satellite> = {
  satellite: Satellite, official: ShieldCheck, community: Users, news: Newspaper, weather: Wind,
};

// Full body moved from src/app/page.tsx (NS-1 extraction)
function IncidentDetailPanel({
  incident,
  onClose,
  isFollowed,
  onToggleFollow,
  lang,
  isMobile = false,
  hideHeader = false,
  sourceHealthState = "healthy",
  sourceHealthReason,
}: {
  incident: Incident;
  onClose: () => void;
  isFollowed: boolean;
  onToggleFollow: () => void;
  lang: Language;
  isMobile?: boolean;
  hideHeader?: boolean;
  sourceHealthState?: "healthy" | "stale" | "fallback" | "empty" | "retryable-error";
  sourceHealthReason?: string;
}) {
  const Wrapper = hideHeader ? "div" : motion.aside;
  const wrapperProps = hideHeader
    ? { className: "h-full flex flex-col bg-transparent" }
    : {
        initial: { x: "-100%", opacity: 0.6 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "-100%", opacity: 0 },
        transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
        className: "w-full md:w-[360px] h-full flex flex-col bg-[var(--ember-bg)] border-r border-[var(--ember-border)] flex-shrink-0 z-30 md:relative absolute left-0 top-0",
      };

  return (
    <Wrapper {...(wrapperProps as any)}>
      {/* Header */}
      <div className="px-4 py-4 border-b border-[var(--ember-border)] flex-shrink-0">
        {isFollowed && (
          <div className="mb-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] text-[10px] font-medium uppercase tracking-wider w-fit">
            <Bell className="w-3 h-3 fill-current" />
            <span>{t(lang, "incident.followingBadge")}</span>
          </div>
        )}
        <div className="flex justify-between items-start gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm md:text-base font-semibold text-[var(--ember-text)] leading-tight truncate">
              {incident.displayName}
            </h2>
            <div className="flex items-center gap-1 text-[11px] text-[var(--ember-text-muted)] mt-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{incident.parish}, {incident.municipality}, {incident.district}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => {
                const url = `${window.location.origin}/?incident=${encodeURIComponent(incident.id)}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast.success(t(lang, "incident.shareCopied"), { description: t(lang, "incident.shareDescription") });
                }).catch(() => {
                  toast(t(lang, "incident.shareTitle") + ": " + url);
                });
              }}
              className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-accent)] hover:bg-[var(--ember-surface-2)] transition-colors"
              aria-label="Share incident"
              title="Copy share link"
            >
              <Navigation className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className={`${isMobile ? "hidden " : ""}w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors`}
              aria-label={t(lang, "a11y.closePanel")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status row — shows collapsed state group + raw operational phase */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[10px] uppercase tracking-wider">
          <span
            className={`flex items-center gap-1.5 font-medium ${
              incident.status === "active" || incident.status === "detected"
                ? "text-[var(--ember-critical)]"
                : incident.status === "contained"
                ? "text-[var(--ember-warning)]"
                : "text-[var(--ember-text-muted)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                incident.status === "active"
                  ? "bg-[var(--ember-critical)]"
                  : "bg-current"
              }`}
            />
            {STATUS_LABEL[incident.status]}
          </span>
          {(incident as any).properties?.statusText && (incident as any).properties.statusText !== STATUS_LABEL[incident.status] && (
            <span className="w-px h-3 bg-[var(--ember-border)]" />
          )}
          {(incident as any).properties?.statusText && (incident as any).properties.statusText !== STATUS_LABEL[incident.status] && (
            <span className="text-[var(--ember-text-muted)] normal-case tracking-normal font-mono text-[10px]">
              {statusRawLabel((incident as any).properties.statusText, lang)}
            </span>
          )}
          <span className="w-px h-3 bg-[var(--ember-border)]" />
          <span className="text-[var(--ember-text-muted)]">
            {lang === "pt" ? "Severidade" : "Severity"}:{" "}
            <span className="text-[var(--ember-text)] font-medium">
              {SEVERITY_LABEL[incident.severity]}
            </span>
          </span>
          <span className="w-px h-3 bg-[var(--ember-border)]" />
          <span className="text-[var(--ember-text-muted)]">
            {timeAgo(incident.lastUpdated, lang)}
          </span>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-accent-subtle)] text-[var(--ember-accent)] font-medium">
            <ShieldCheck className="w-3 h-3" />
            {verificationLabel(incident.verification, lang)}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] font-medium">
            <TrendingUp className="w-3 h-3" />
            {Math.round(incident.confidence * 100)}% {t(lang, "incident.confidence")}
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ember-surface-2)] text-[var(--ember-text-muted)] font-medium">
            <Radio className="w-3 h-3" />
            {incident.sourceCount} {lang === "pt" ? "fontes" : "sources"}
          </span>
        </div>

        {sourceHealthState !== "healthy" && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-[var(--ember-warning)]/30 bg-[var(--ember-warning-subtle)] px-2 py-1.5 text-[11px] normal-case tracking-normal text-[var(--ember-warning)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{sourceHealthReason ?? (lang === "pt" ? "Uma ou mais fontes precisam de atenção." : "One or more sources need attention.")}</span>
          </div>
        )}

        {/* Source type dots */}
        <div className="flex gap-1.5 mt-2">
          {incident.sourceTypes.map((st) => {
            const Icon = SOURCE_ICON[st];
            return (
              <span
                key={st}
                className="flex items-center gap-1 text-[10px] text-[var(--ember-text-faint)]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      st === "satellite"
                        ? "var(--ember-source-satellite)"
                        : st === "official"
                        ? "var(--ember-source-official)"
                        : st === "community"
                        ? "var(--ember-source-community)"
                        : st === "news"
                        ? "var(--ember-source-news)"
                        : "var(--ember-source-weather)",
                  }}
                />
                {sourceLabel(st, lang)}
              </span>
            );
          })}
        </div>

        <AnimatedButton
          variant={isFollowed ? "accent" : "default"}
          className={`mt-3 min-h-11 w-full text-[11px] uppercase tracking-wider font-medium ${
            !isFollowed ? "bg-[var(--ember-surface-2)]" : ""
          }`}
          onClick={onToggleFollow}
        >
          <Bell className="w-3.5 h-3.5" />
          {isFollowed ? t(lang, "incident.following") : t(lang, "incident.followIncident")}
        </AnimatedButton>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto ember-scroll">
        <div className="p-4 md:p-5">
          <OverviewTab incident={incident} lang={lang} />
          <details className="mt-6 border-t border-[var(--ember-border)] pt-3">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-[var(--ember-text-muted)] hover:text-[var(--ember-text)]">
              {t(lang, "incident.timeline")}
            </summary>
            <div className="pt-4"><TimelineTab incident={incident} lang={lang} /></div>
          </details>
          <details className="mt-4 border-t border-[var(--ember-border)] pt-3">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-[var(--ember-text-muted)] hover:text-[var(--ember-text)]">
              {t(lang, "incident.sources")}
            </summary>
            <div className="pt-4"><SourcesTab incident={incident} lang={lang} /></div>
          </details>
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-3 md:p-4 border-t border-[var(--ember-border)] bg-[var(--ember-surface)] flex flex-col gap-2 flex-shrink-0">
        {incident.evacuationOrder && (
          <div className="px-3 py-2 rounded-md bg-[var(--ember-critical-subtle)] border border-[var(--ember-critical)]/30 text-xs text-[var(--ember-critical)] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">{lang === "pt" ? "Ordem de evacuação ativa" : "Evacuation order active"}</div>
              <div className="text-[var(--ember-critical)]/80 normal-case tracking-normal">
                {lang === "pt" ? "Siga as instruções oficiais da proteção civil. Abrigo:" : "Follow official civil protection instructions. Shelter:"}{" "}
                {incident.municipality} {lang === "pt" ? "pavilhão" : "pavilion"}.
              </div>
            </div>
          </div>
        )}
      </div>
    </Wrapper>
  );
}

// ============================================================
// Overview tab
// ============================================================
function OverviewTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const sevColor =
    incident.severity === "critical" ? "var(--ember-critical)"
    : incident.severity === "high" ? "var(--ember-warning)"
    : incident.severity === "medium" ? "var(--ember-info)"
    : "var(--ember-success)";

  // Fetch news matched to this incident's location
  const matchedNews = useMatchedIncidentNews(incident.id);

  return (
    <div className="flex flex-col gap-3">
      {/* Description */}
      <p className="text-xs leading-relaxed text-[var(--ember-text-muted)] break-words line-clamp-3">
        {incident.description}
      </p>

      {/* Conditions — metric cards */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {t(lang, "incident.conditions")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            icon={Wind}
            label={t(lang, "incident.wind")}
            value={incident.windKmh > 0 ? `${incident.windKmh}` : "—"}
            unit={incident.windKmh > 0 ? `km/h ${incident.windDirection}` : ""}
          />
          <MetricCard
            icon={Droplets}
            label={t(lang, "incident.humidity")}
            value={incident.humidity > 0 ? `${incident.humidity}` : "—"}
            unit={incident.humidity > 0 ? "%" : ""}
            danger={incident.humidity > 0 && incident.humidity < 20}
          />
          <MetricCard
            icon={Thermometer}
            label={t(lang, "incident.temp")}
            value={incident.temperatureC > 0 ? `${incident.temperatureC}` : "—"}
            unit={incident.temperatureC > 0 ? "°C" : ""}
            danger={incident.temperatureC > 32}
          />
        </div>
      </div>

      {/* Resources deployed */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          {t(lang, "incident.resources")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCard icon={Plane} label={t(lang, "incident.aircraft")} value={`${incident.aircraft}`} unit={t(lang, "incident.aircraftActive")} accent={incident.aircraft > 0} />
          <MetricCard icon={Truck} label={t(lang, "incident.engines")} value={`${incident.engines}`} unit={t(lang, "incident.enginesDeployed")} accent={incident.engines > 0} />
          <MetricCard icon={Users} label={t(lang, "incident.personnel")} value={`${incident.personnel}`} unit={t(lang, "incident.personnelOnScene")} accent={incident.personnel > 0} />
        </div>
      </div>

      {/* Area + Risk — side by side */}
      <div className="grid grid-cols-2 gap-2">
        {/* Area */}
        <div className="bg-[var(--ember-surface-2)] rounded-lg p-3 border border-[var(--ember-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1.5 font-medium">
            {t(lang, "incident.areaBurned")}
          </div>
          {incident.estimatedAreaHa > 0 ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-mono font-bold" style={{ color: sevColor }}>
                  {incident.estimatedAreaHa.toLocaleString()}
                </span>
                <span className="text-[10px] text-[var(--ember-text-faint)]">ha</span>
              </div>
              <div className="text-[10px] text-[var(--ember-text-faint)] mt-0.5">
                ≈ {(incident.estimatedAreaHa * 0.01).toFixed(2)} km²
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--ember-text-muted)] italic">
              {t(lang, "incident.notEstimated")}
            </div>
          )}
        </div>

        {/* IPMA Risk */}
        <div className="bg-[var(--ember-surface-2)] rounded-lg p-3 border border-[var(--ember-border)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1.5 font-medium">
            {t(lang, "incident.fireRisk")}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
              style={{
                background:
                  incident.ipmaRisk === "maximum" ? "var(--ember-critical)"
                  : incident.ipmaRisk === "very_high" ? "var(--ember-warning)"
                  : incident.ipmaRisk === "high" ? "var(--ember-info)"
                  : "var(--ember-success)",
                color: incident.ipmaRisk === "maximum" || incident.ipmaRisk === "very_high" ? "white" : "var(--ember-text)",
              }}
            >
              {t(lang, `risk.${incident.ipmaRisk === "very_high" ? "veryHigh" : incident.ipmaRisk}`)}
            </span>
          </div>
          <div className="text-[10px] text-[var(--ember-text-faint)] mt-1 truncate">{t(lang, "incident.sourceIPMA")}</div>
        </div>
      </div>

      {/* First detected */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--ember-text-faint)]">
        <Clock className="w-3 h-3" />
        {t(lang, "incident.firstDetected")} {formatDate(incident.firstDetected)} {formatTime(incident.firstDetected)} UTC
      </div>

      {/* Road closures */}
      {incident.roadClosures && incident.roadClosures.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-2 font-medium">
            {t(lang, "incident.roadClosures")}
          </div>
          <div className="space-y-1.5">
            {incident.roadClosures.map((road) => (
              <div
                key={road}
                className="flex items-center gap-2 text-sm text-[var(--ember-text-muted)] bg-[var(--ember-surface-2)] px-3 py-2 rounded-md border border-[var(--ember-border)]"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--ember-warning)] flex-shrink-0" />
                {road}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matched press articles for this incident's location */}
      {matchedNews.data?.items && matchedNews.data.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium flex items-center gap-1.5">
              <Newspaper className="w-3 h-3" />
              {lang === "pt" ? "Imprensa sobre este local" : "Press for this location"}
            </div>
            <span className="text-[10px] text-[var(--ember-text-faint)] tabular-nums">
              {matchedNews.data.items.length} {lang === "pt" ? "artigos" : "articles"}
            </span>
          </div>
          <div className="space-y-1.5">
            {matchedNews.data.items.map((item) => (
              <a
                key={item.id}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30 hover:border-[var(--ember-accent)] rounded-md p-2.5 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  <Flame className="w-3 h-3 mt-0.5 text-[var(--ember-accent)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-[var(--ember-text)] leading-tight line-clamp-2 group-hover:text-[var(--ember-accent)] transition-colors">
                      {item.title}
                    </div>
                    {item.summary && (
                      <div className="text-[10px] text-[var(--ember-text-muted)] mt-1 line-clamp-2 leading-relaxed">
                        {item.summary}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-[var(--ember-text-faint)]">
                      <span className="font-semibold uppercase tracking-wider text-[var(--ember-accent)]">
                        {item.source}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(item.publishedAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                      </span>
                      {item.matchedOn && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--ember-accent)] font-medium">
                            {item.matchedOn}
                          </span>
                        </>
                      )}
                      <ExternalLink className="w-2.5 h-2.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  danger,
  accent,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
  unit: string;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2.5 border transition-all hover:scale-[1.02] hover:shadow-sm ${
      accent
        ? "bg-[var(--ember-accent-subtle)] border-[var(--ember-accent)]/30 hover:border-[var(--ember-accent)]/60"
        : "bg-[var(--ember-surface-2)] border-[var(--ember-border)] hover:border-[var(--ember-border-strong)]"
    }`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-lg font-mono font-bold ${
            danger ? "text-[var(--ember-critical)]"
            : accent ? "text-[var(--ember-accent)]"
            : "text-[var(--ember-text)]"
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-[10px] text-[var(--ember-text-faint)]">{unit}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Timeline tab
// ============================================================
function TimelineTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/incidents/${encodeURIComponent(incident.id)}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setSnapshots(data.snapshots || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [incident.id]);

  // Combine persisted snapshots with any inline timeline events
  const allEvents = useMemo(() => {
    const events: Array<{
      id: string;
      timestamp: string;
      sourceType: SourceType;
      sourceName: string;
      title: string;
      description: string;
      confidence: number;
      note?: string;
    }> = [];

    // Add persisted snapshots (from Prisma)
    for (const snap of snapshots) {
      events.push({
        id: snap.id,
        timestamp: snap.timestamp,
        sourceType: "official" as const,
        sourceName: "ANEPC (persisted)",
        title: snap.note?.includes("→")
          ? snap.note.split(";")[0] // First change as title
          : snap.statusText || snap.status,
        description: snap.note || `${snap.status} · ${snap.severity} · ${snap.personnelTotal} personnel`,
        confidence: 0.95,
        note: snap.note,
      });
    }

    // Add inline timeline events (from the incident object itself)
    for (const evt of (incident as Incident).timeline || []) {
      events.push(evt);
    }

    // Sort newest first
    return events.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [snapshots, incident]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] mb-1 font-medium">
          Loading timeline…
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton width={14} height={14} className="rounded-full mt-0.5" />
            <div className="flex-1 space-y-1">
              <Skeleton width="40%" height={10} />
              <Skeleton width="80%" height={8} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
          Activity timeline
        </span>
        <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
          {allEvents.length} events
        </span>
      </div>

      {allEvents.length === 0 && (
        <div className="text-xs text-[var(--ember-text-faint)] text-center py-6">
          No timeline events recorded yet.
        </div>
      )}

      <div className="relative">
        {allEvents.length > 0 && (
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--ember-border)]" />
        )}

        <StaggerChildren stagger={0.04} className="flex flex-col gap-4">
          {allEvents.map((evt, idx) => {
            const Icon = SOURCE_ICON[evt.sourceType] || ShieldCheck;
            const dotColor =
              evt.sourceType === "satellite"
                ? "var(--ember-source-satellite)"
                : evt.sourceType === "official"
                ? "var(--ember-source-official)"
                : evt.sourceType === "community"
                ? "var(--ember-source-community)"
                : "var(--ember-source-weather)";
            return (
              <StaggerItem key={evt.id || idx}>
                <div className="relative pl-6">
                  <div
                    className="absolute left-1 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--ember-bg)] flex items-center justify-center"
                    style={{ background: dotColor }}
                  >
                    <Icon className="w-2 h-2 text-white" />
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-[var(--ember-text-faint)]">
                      {formatDate(evt.timestamp)} {formatTime(evt.timestamp)} UTC
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[var(--ember-border)] font-medium" style={{ color: dotColor }}>
                      {sourceLabel(evt.sourceType, lang) || evt.sourceType}
                    </span>
                  </div>

                  <div className="text-sm font-medium text-[var(--ember-text)] mb-0.5">
                    {evt.title}
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--ember-text-muted)]">
                    {evt.description}
                  </p>
                  <div className="text-[10px] text-[var(--ember-text-faint)] mt-1">
                    {evt.sourceName} · {Math.round(evt.confidence * 100)}% confidence
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerChildren>
      </div>
    </div>
  );
}

// ============================================================
// Sources tab
// ============================================================
function SourcesTab({ incident, lang }: { incident: Incident; lang: Language }) {
  const sourcesByType = useMemo(() => {
    const map = new Map<SourceType, TimelineEvent[]>();
    for (const evt of incident.timeline) {
      if (!map.has(evt.sourceType)) map.set(evt.sourceType, []);
      map.get(evt.sourceType)!.push(evt);
    }
    return map;
  }, [incident]);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)] font-medium">
        Source breakdown ({incident.sourceCount} contributing sources)
      </div>

      {Array.from(sourcesByType.entries()).map(([type, events]) => {
        const Icon = SOURCE_ICON[type];
        const color =
          type === "satellite"
            ? "var(--ember-source-satellite)"
            : type === "official"
            ? "var(--ember-source-official)"
            : type === "community"
            ? "var(--ember-source-community)"
            : type === "news"
            ? "var(--ember-source-news)"
            : "var(--ember-source-weather)";
        return (
          <div key={type} className="border border-[var(--ember-border)] rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
                <span className="text-sm font-medium text-[var(--ember-text)]">
                  {sourceLabel(type, lang)}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--ember-text-faint)]">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[var(--ember-text-muted)]">
                    {evt.sourceName}
                  </span>
                  <span className="text-[var(--ember-text-faint)] font-mono">
                    {formatTime(evt.timestamp)} · {Math.round(evt.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-2 p-3 bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30 rounded-md text-xs text-[var(--ember-text-muted)] leading-relaxed">
        <div className="flex items-center gap-1.5 text-[var(--ember-accent)] font-medium mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Trust envelope
        </div>
        Aggregate confidence:{" "}
        <span className="font-mono text-[var(--ember-text)]">
          {Math.round(incident.confidence * 100)}%
        </span>
        . Verification status:{" "}
        <span className="text-[var(--ember-text)]">
          {verificationLabel(incident.verification, lang)}
        </span>
        . Trust engine v1.0 — confidence computed from source reputation,
        corroboration count, and freshness decay.
      </div>
    </div>
  );
}

// ============================================================
// Notifications drawer
// ============================================================
function NotificationsDrawer({
  notifications,
  onClose,
  onMarkAllRead,
  onSelectIncident,
  lang,
}: {
  notifications: any[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelectIncident: (id: string) => void;
  lang: Language;
}) {
  return (
    <OverlayDrawer ariaLabel={t(lang, "header.viewNotifications")} onClose={onClose}>
        <div className="px-5 py-4 border-b border-[var(--ember-border)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--ember-text)]">
              Notifications
            </h2>
            <p className="text-xs text-[var(--ember-text-faint)] mt-0.5">
              {notifications.filter((n) => !n.read).length} unread
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="text-xs text-[var(--ember-accent)] hover:underline"
              aria-label={t(lang, "a11y.markAllRead")}
            >
              {t(lang, "a11y.markAllRead")}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
              aria-label={t(lang, "a11y.closeNotifications")}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto ember-scroll p-3 flex flex-col gap-2">
          <StaggerChildren stagger={0.06}>
          {notifications.map((n) => {
            const incident = SAMPLE_INCIDENTS.find((i) => i.id === n.incidentId);
            const priorityColor =
              n.priority === "critical"
                ? "var(--ember-critical)"
                : n.priority === "standard"
                ? "var(--ember-warning)"
                : "var(--ember-text-faint)";
            return (
              <StaggerItem key={n.id}>
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectIncident(n.incidentId)}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  n.read
                    ? "bg-[var(--ember-surface)] border-[var(--ember-border)] opacity-70"
                    : "bg-[var(--ember-surface)] border-[var(--ember-border)] hover:border-[var(--ember-accent)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: priorityColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-[var(--ember-text)]">
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ember-accent)] flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-[var(--ember-text-muted)] leading-relaxed mb-1.5">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--ember-text-faint)]">
                      <span className="uppercase tracking-wider font-medium" style={{ color: priorityColor }}>
                        {n.priority}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(n.timestamp, lang)}</span>
                      {incident && (
                        <>
                          <span>·</span>
                          <span>{incident.displayName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
              </StaggerItem>
            );
          })}
          </StaggerChildren>
        </div>

        <div className="p-3 border-t border-[var(--ember-border)] text-[10px] text-[var(--ember-text-faint)] text-center">
          Notification engine · Critical alerts bypass quiet hours
        </div>
    </OverlayDrawer>
  );
}

export { IncidentDetailPanel, NotificationsDrawer };
