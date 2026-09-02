import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";

import "@/lib/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const url = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_TAGLINE,
    url,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_TAGLINE,
  },
};

export const viewport: Viewport = {
  themeColor: "#0E1013",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables must sit on <html>: globals.css applies font-sans at
    // the html level, so a variable declared on <body> resolves to nothing.
    //
    // No theme class is rendered on the server. With defaultTheme="system" the
    // server cannot know the answer, and guessing would flash the other way for
    // half the audience. next-themes' inline script writes the class before
    // paint, and globals.css carries a prefers-color-scheme ground for the
    // window before it runs. suppressHydrationWarning covers the class it adds.
    <html
      lang="en"
      className={`${instrumentSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/* Rule 8b: system, not dark. Light mode exists for the document-like
            surfaces — dashboard and scheduling — and a light mode nobody
            defaults into is unverified code that still has to be maintained.
            `.dark` is forced on /j/[code] and /room/[code] in their route-group
            layouts, so the video preview is never shown on a light ground. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
