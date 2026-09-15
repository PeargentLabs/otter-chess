import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL, withBasePath } from "@/lib/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const siteUrl = SITE_URL;
const siteTitle = "Otter Chess - Client-Side WebGPU Chess AI & Docs";
const siteDescription =
  "Play against Otter Chess, a skill-conditioned chess move prediction AI running locally in your browser with WebGPU acceleration. Access developer APIs, educational scripts, and data pipeline documentation.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | Otter Chess",
  },
  description: siteDescription,
  keywords: [
    "chess AI",
    "human-like chess engine",
    "chess move prediction",
    "WebGPU chess",
    "browser chess engine",
    "rating-conditioned chess model",
    "Maia chess",
    "machine learning chess",
    "client-side AI",
    "PeargentLabs",
  ],
  authors: [{ name: "PeargentLabs", url: "https://github.com/PeargentLabs" }],
  creator: "PeargentLabs",
  publisher: "PeargentLabs",
  applicationName: "Otter Chess",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Otter Chess",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Otter Chess — a chess engine that plays like you",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  // Unlike `manifest` and the openGraph URLs, icon hrefs are emitted verbatim —
  // Next applies neither basePath nor metadataBase to them.
  icons: {
    icon: [
      { url: withBasePath("/favicon.ico") },
      {
        url: withBasePath("/favicon-96x96.png"),
        sizes: "96x96",
        type: "image/png",
      },
      { url: withBasePath("/favicon.svg"), type: "image/svg+xml" },
    ],
    apple: [
      {
        url: withBasePath("/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport = {
  themeColor: "#FAFAF6",
};

import Header from "../components/Header";
import OlympiadTopBanner from "../components/OlympiadTopBanner";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Otter Chess",
  applicationCategory: "GameApplication",
  operatingSystem: "Any (runs in browser via WebGPU/WASM)",
  description: siteDescription,
  url: siteUrl,
  image: `${siteUrl}/otter-hero.png`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Organization",
    name: "PeargentLabs",
    url: "https://github.com/PeargentLabs",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-paper font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Header />
        <OlympiadTopBanner />
        <main className="grow flex flex-col">{children}</main>
      </body>
    </html>
  );
}
