import type { MetadataRoute } from "next";

// Lets phones install the site as an app ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finances",
    short_name: "Finances",
    description: "Personal finance dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2ee",
    theme_color: "#f3f2ee",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
