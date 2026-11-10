import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ThemedToaster } from "@/components/ThemedToaster";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// Inter for reading and UI; Source Serif 4 (standing in for DESIGN.md's display serif)
// for headings and the big numbers. Its optical-size axis keeps large sizes crisp.
// Both are Google Fonts' Latin variable files, kept in the repo so builds need no network.
const inter = localFont({ src: "./fonts/inter-latin-var.woff2", weight: "100 900", variable: "--font-inter" });
const serif = localFont({ src: "./fonts/source-serif-4-latin-var.woff2", weight: "200 900", variable: "--font-serif4" });

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
  // No themeColor: the head script writes those metas so the chosen theme survives navigations.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets data-theme before hydration, so React must not flag the difference.
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full antialiased`} suppressHydrationWarning>
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
