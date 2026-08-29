import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Little Chapters",
    short_name: "Chapters",
    description:
      "Your baby's story, created automatically. A private family childhood archive.",
    start_url: "/home",
    display: "standalone",
    background_color: "#FDFBF7",
    theme_color: "#FDFBF7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
