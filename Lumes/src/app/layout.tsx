import type { Metadata, Viewport } from "next";
// Anti-AI typography:
// - Fraunces (variable serif, optical sizing) for display — gives the site
//   editorial character and breaks the "all sans-serif tech site" pattern
// - Onest (humanist sans, less common than Inter/Geist) for body — softer,
//   more human than the Vercel-default Geist
// - JetBrains Mono for data/code — more personality than Geist Mono
import { Fraunces, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import SWRegister from "@/components/sw-register";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const onest = Onest({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${onest.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <SWRegister />
          <SonnerToaster
            position="top-center"
            richColors
            closeButton
            mobileOffset={{ top: 64 }}
            toastOptions={{
              style: {
                background: "var(--ember-surface)",
                border: "1px solid var(--ember-border)",
                color: "var(--ember-text)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
