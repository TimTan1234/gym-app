import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GymPal: AI nutrition and training log",
    short_name: "GymPal",
    description: "AI meal analysis, workout logging, training plans and progress tracking.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f5",
    theme_color: "#faf9f5",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log meal", url: "/nutrition/log", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Train", url: "/train", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
