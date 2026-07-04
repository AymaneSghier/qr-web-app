import type { Metadata } from "next";
import { Bodoni_Moda, Inter, Jost } from "next/font/google";
import "./globals.css";

// Amourette type system (docs/design.md): Bodoni Moda for display/wordmark,
// Inter for body, Jost for uppercase tracked labels and buttons. All three are
// variable fonts, so weights are covered without listing them.
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amourette",
  description: "See who's in the bar tonight. Like discreetly, match if it's mutual.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${inter.variable} ${jost.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
