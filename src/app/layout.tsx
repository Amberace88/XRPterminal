import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { SITE } from "@/lib/config";
import { CookieConsent } from "@/components/legal/CookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "XRP Terminal — See beyond the price.", template: "%s · XRP Terminal" },
  description: SITE.description,
  applicationName: "XRP Terminal",
  keywords: ["XRP", "XRP Ledger", "XRPL", "XRP price", "XRP analytics", "XRPL explorer", "XRP wallet", "paper trading", "RLUSD"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "XRP Terminal",
    title: "XRP Terminal — See beyond the price.",
    description: SITE.description,
    url: SITE.url,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "XRP Terminal" }],
  },
  twitter: { card: "summary_large_image", title: "XRP Terminal — See beyond the price.", description: SITE.description, images: ["/og.png"] },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080a0e" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem('xrpt:prefs')||'{}');if(p.theme)document.documentElement.dataset.theme=p.theme;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <AppProviders>
          {children}
          <CookieConsent />
        </AppProviders>
      </body>
    </html>
  );
}
