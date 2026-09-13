import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Playfair_Display } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Mergo — Real-time Collaborative Text Editor",
  description:
    "A fast, real-time collaborative text editor built with Next.js, Clerk, and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#1fb622",
          colorPrimaryForeground: "#060606",
          colorBackground: "#0d0d0d",
          colorForeground: "#eeeeee",
          colorMutedForeground: "#aaaaaa",
          colorInput: "#060606",
          colorInputForeground: "#eeeeee",
          colorBorder: "#1a1a1a",
        },
      }}
    >
      <html
        lang="en"
        suppressHydrationWarning
        className={`${GeistSans.variable} ${GeistMono.variable} ${playfair.variable}`}
      >
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  try {
                    var stored = localStorage.getItem('mergo-theme');
                    if (stored === 'light' || stored === 'dark') {
                      document.documentElement.setAttribute('data-theme', stored);
                    } else {
                      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
                    }
                  } catch(e) {}
                })();
              `,
            }}
          />
        </head>
        <body
          className={`${GeistSans.className} bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen antialiased`}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
