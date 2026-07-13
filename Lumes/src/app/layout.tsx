import type { Metadata, Viewport } from "next";
// Typography contract: IBM Plex Sans for UI and IBM Plex Mono for data.
// Fraunces remains available only for the public brand mark.
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import SWRegister from "@/components/sw-register";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "lumes.pt — Wildfire Intelligence for Portugal",
  description:
    "Real-time wildfire awareness platform for Portuguese citizens. Trusted live fire map, official bulletins, community reports, and prevention intelligence.",
  keywords: ["wildfire", "Portugal", "fire map", "ANEPC", "civil protection", "lumes.pt", "incêndio", "floresta"],
  authors: [{ name: "lumes.pt" }],
  openGraph: {
    title: "lumes.pt — Wildfire Intelligence for Portugal",
    description: "Real-time wildfire awareness platform for Portuguese citizens.",
    type: "website",
    locale: "pt_PT",
    alternateLocale: "en_US",
    siteName: "lumes.pt",
  },
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "https://lumes.pt/feed.xml", title: "lumes.pt — Incêndios ativos" },
      ],
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumes.pt"),
  applicationName: "lumes.pt",
  category: "government",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Public routes are intentionally Portuguese-only until route-level locale
  // negotiation is introduced; the map app still supports PT/EN.
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <MotionProvider>
            {children}
            <SWRegister />
            <SonnerToaster
            position="top-left"
            richColors
            closeButton
            // Keep transient feedback below the map's top status corridor on
            // desktop and below the mobile summary/header safe area. This is
            // shared by refresh, recovery, report, and follow feedback.
            offset={{ top: 128, left: 384, right: 16 }}
            mobileOffset={{ top: "calc(112px + env(safe-area-inset-top))", left: 12, right: 12 }}
            toastOptions={{
              style: {
                background: "var(--ember-surface)",
                border: "1px solid var(--ember-border)",
                color: "var(--ember-text)",
                width: "min(360px, calc(100vw - 32px))",
                maxWidth: "calc(100vw - 32px)",
              },
            }}
            />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
