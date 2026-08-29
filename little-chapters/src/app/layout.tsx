import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Little Chapters — Your baby's story, created automatically",
    template: "%s · Little Chapters",
  },
  description:
    "Little Chapters turns the photos, videos, and little moments already on your phone into a childhood story you'll actually keep.",
  applicationName: "Little Chapters",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Little Chapters",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FDFBF7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Display + text faces; system stacks take over if these can't load */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* app router loads this stylesheet globally via the root layout;
            system font stacks take over whenever it can't load */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
