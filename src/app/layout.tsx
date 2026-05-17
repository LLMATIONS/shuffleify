import type { Metadata } from "next";
import "./globals.css";

// Public URL is hardcoded because the app is reverse-proxied at a fixed
// path (swagcounty.com/shuffleify) and basePath alone doesn't give the
// OpenGraph crawler an absolute URL. If shuffleify ever moves to its own
// domain, update these URLs in lockstep with the deploy.
export const metadata: Metadata = {
  metadataBase: new URL("https://swagcounty.com/shuffleify"),
  title: "shuffleify",
  description: "A Spotify shuffler that actually shuffles.",
  openGraph: {
    title: "shuffleify",
    description: "A Spotify shuffler that actually shuffles.",
    url: "https://swagcounty.com/shuffleify",
    siteName: "shuffleify",
    type: "website",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "shuffleify",
    description: "A Spotify shuffler that actually shuffles.",
    images: ["/og-card.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
