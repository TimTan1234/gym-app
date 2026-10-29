import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ThemedToaster } from "@/components/ThemedToaster";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// Inter for reading and UI; Source Serif 4 (standing in for DESIGN.md's display serif)
// for headings and the big numbers. Its optical-size axis keeps large sizes crisp.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif4", subsets: ["latin"], axes: ["opsz"] });

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
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#181715" },
  ],
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
