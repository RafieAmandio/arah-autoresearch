import type { Metadata } from "next";
import { Martian_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/* Two families on a contrast axis, both inherited from the Arah deck and the
   marketing site so the three surfaces read as one company. */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

/* Micro labels only: 11px to 13px, short uppercase strings. One weight. */
const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});

const DESCRIPTION =
  "An agent doing research, in public, one commit at a time. A human writes the goal and the constraints, a frozen eval scores every attempt, and the git history is the experiment log.";

export const metadata: Metadata = {
  title: {
    default: "Research | Arah AI",
    template: "%s | Arah AI Research",
  },
  description: DESCRIPTION,
  applicationName: "Arah AI Research",
  openGraph: {
    title: "Research | Arah AI",
    description: DESCRIPTION,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
