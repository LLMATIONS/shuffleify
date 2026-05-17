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
      <body className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <footer className="bg-zinc-950 px-8 pb-8 pt-4 text-center text-sm text-zinc-500">
          <p>
            <span className="font-semibold text-zinc-400">
              Open source · AGPL-3.0
            </span>{" "}
            ·{" "}
            <a
              href="https://github.com/LLMATIONS/shuffleify"
              target="_blank"
              rel="noreferrer noopener"
              className="text-zinc-400 underline transition-colors hover:text-zinc-200"
            >
              GitHub →
            </a>
          </p>
          <p className="mt-2">
            Bug reports, kind words, weird ideas →{" "}
            <a
              href="mailto:will@swagcounty.com"
              className="font-semibold text-zinc-300 underline transition-colors hover:text-zinc-100"
            >
              will@swagcounty.com
            </a>
          </p>
          <p className="mt-2 italic">Built for the love of the game.</p>
        </footer>
      </body>
    </html>
  );
}
