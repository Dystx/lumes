"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { t, type Language } from "@/lib/i18n";
import { buildReportPayload, type CommunityReportType } from "@/lib/public-actions";
import { submitCommunityReport } from "@/lib/community-report-client";
import { AlertTriangle, CheckCircle2, Flame, MapPin, Users, Wind, X } from "@/components/icons/phosphor-icons";
import { AnimatedButton } from "@/components/ember-anim";
import { OverlayDialog } from "@/components/ui/overlay-dialog";

interface ReportFireModalProps {
  onClose: () => void;
  lang: Language;
}

type ReportLocation = { lat: number; lon: number };

export function ReportFireModal({ onClose, lang }: ReportFireModalProps) {
  const [reportType, setReportType] = useState<CommunityReportType>("smoke");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [locating, setLocating] = useState(false);

  const reportTypes = [
    { value: "smoke", label: t(lang, "report.smoke"), icon: Wind, color: "var(--ember-warning)" },
    { value: "flame", label: t(lang, "report.flame"), icon: Flame, color: "var(--ember-critical)" },
    { value: "road_closure", label: t(lang, "report.roadClosure"), icon: AlertTriangle, color: "var(--ember-info)" },
    { value: "evacuation", label: t(lang, "report.evacuation"), icon: Users, color: "var(--ember-critical)" },
    { value: "contained", label: t(lang, "report.contained"), icon: CheckCircle2, color: "var(--ember-success)" },
  ] as const;

  const handleGetLocation = () => {
    setLocating(true);
    if (!navigator.geolocation) {
      toast.error(t(lang, "report.geoNotSupported"));
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        setLocating(false);
        toast.success(t(lang, "report.locationCaptured"));
      },
      (error) => {
        const errorKey: Record<number, string> = {
          1: "report.geoPermissionDenied",
          2: "report.geoPositionUnavailable",
          3: "report.geoTimeout",
        };
        const message = errorKey[error.code] ? t(lang, errorKey[error.code]) : error.message;
        toast.error(`${t(lang, "report.geoFailed")}: ${message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async () => {
    if (!location) {
      toast.error(t(lang, "report.captureLocationFirst"));
      return;
    }
    setSubmitting(true);
    try {
      await submitCommunityReport(buildReportPayload({
          reportType,
          latitude: location.lat,
          longitude: location.lon,
          description,
          reporterName,
        }));
      toast.success(t(lang, "toast.reportSubmitted"), {
        description: t(lang, "toast.reportDesc"),
        duration: 6000,
      });
      onClose();
    } catch (error: unknown) {
      toast.error(t(lang, "report.submissionFailed"), {
        description: error instanceof Error ? error.message : t(lang, "toast.reportFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OverlayDialog
      ariaLabel={t(lang, "report.title")}
      onClose={onClose}
      panelClassName="w-full max-w-[440px] max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--ember-border)] ember-scroll"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ember-border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[var(--ember-critical)] flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ember-text)]">{t(lang, "report.title")}</h2>
            <p className="text-meta text-[var(--ember-text-faint)]">{t(lang, "report.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-md flex items-center justify-center text-[var(--ember-text-faint)] hover:text-[var(--ember-text)] hover:bg-[var(--ember-surface-2)] transition-colors"
          aria-label={t(lang, "a11y.closePanel")}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="px-3 py-2 rounded-md bg-[var(--ember-critical-subtle)] border border-[var(--ember-critical)]/30 text-xs text-[var(--ember-critical)] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{t(lang, "report.emergency")}.</span> {t(lang, "report.emergencyDesc")}
          </div>
        </div>

        <div>
          <label className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.reportType")}</label>
          <div className="grid grid-cols-1 gap-1.5">
            {reportTypes.map((report) => (
              <motion.button
                key={report.value}
                type="button"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setReportType(report.value)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
                  reportType === report.value
                    ? "bg-[var(--ember-surface-2)] border-[var(--ember-border-strong)]"
                    : "border-[var(--ember-border)] hover:bg-[var(--ember-surface-2)]"
                }`}
              >
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: reportType === report.value ? report.color : "var(--ember-surface-2)", color: reportType === report.value ? "white" : "var(--ember-text-muted)" }}
                >
                  <report.icon className="w-3.5 h-3.5" />
                </span>
                <span className={`text-sm ${reportType === report.value ? "text-[var(--ember-text)] font-medium" : "text-[var(--ember-text-muted)]"}`}>{report.label}</span>
                {reportType === report.value && <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: report.color }} />}
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.location")}</label>
          {location ? (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-md bg-[var(--ember-accent-subtle)] border border-[var(--ember-accent)]/30">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--ember-accent)]" />
                <span className="text-sm font-mono text-[var(--ember-text)]">{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
              </div>
              <button type="button" onClick={handleGetLocation} className="text-xs text-[var(--ember-accent)] hover:underline">{t(lang, "report.update")}</button>
            </div>
          ) : (
            <AnimatedButton variant="default" className="w-full" onClick={handleGetLocation} loading={locating}>
              <MapPin className="w-3.5 h-3.5" />
              {locating ? t(lang, "report.gettingLocation") : t(lang, "report.captureLocation")}
            </AnimatedButton>
          )}
        </div>

        <div>
          <label htmlFor="report-description" className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.description")}</label>
          <textarea
            id="report-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t(lang, "report.descriptionPlaceholder")}
            rows={3}
            aria-describedby="report-description-help"
            className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md px-3 py-2 text-sm text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-accent)]/20 transition-all resize-none"
          />
          <span id="report-description-help" className="sr-only">Optional description for the fire report</span>
        </div>

        <div>
          <label htmlFor="report-name" className="text-meta uppercase tracking-wider text-[var(--ember-text-faint)] font-medium mb-2 block">{t(lang, "report.yourName")}</label>
          <input
            id="report-name"
            type="text"
            value={reporterName}
            onChange={(event) => setReporterName(event.target.value)}
            placeholder={t(lang, "report.anonymous")}
            autoComplete="name"
            className="w-full bg-[var(--ember-surface-2)] border border-[var(--ember-border)] rounded-md px-3 py-2 text-sm text-[var(--ember-text)] placeholder:text-[var(--ember-text-faint)] focus:border-[var(--ember-accent)] focus:outline-none transition-colors h-9"
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-[var(--ember-border)] flex items-center justify-between">
        <span className="text-meta text-[var(--ember-text-faint)]">{t(lang, "report.moderationNote")}</span>
        <div className="flex gap-2">
          <AnimatedButton variant="ghost" size="sm" onClick={onClose}>{t(lang, "report.cancel")}</AnimatedButton>
          <AnimatedButton variant="critical" size="sm" onClick={handleSubmit} loading={submitting} disabled={!location}>
            {t(lang, "report.submit")}
          </AnimatedButton>
        </div>
      </div>
    </OverlayDialog>
  );
}
