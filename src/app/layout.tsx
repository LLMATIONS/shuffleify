import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "shuffleify",
  description: "A Spotify shuffler that actually shuffles.",
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
