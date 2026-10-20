import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ThemedToaster } from "@/components/ThemedToaster";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// One family; the width axis does the expressive work (condensed numerals,
// semi-condensed headings, normal-width body).
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: { default: "GymPal", template: "%s | GymPal" },
  description: "AI-powered nutrition tracking, workout logging and training plans.",
  applicationName: "GymPal",
  appleWebApp: { capable: true, title: "GymPal", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0ec" },
    { media: "(prefers-color-scheme: dark)", color: "#16181b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets data-theme before hydration, so React must not flag the difference.
    <html lang="en" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <ThemedToaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
