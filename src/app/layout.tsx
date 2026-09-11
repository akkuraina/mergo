import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mergo — Real-time Collaborative Text Editor",
  description: "A fast, real-time collaborative text editor built with Next.js, Clerk, and Supabase.",
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
      <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <body className={`${GeistSans.className} bg-[#060606] text-[#eeeeee] min-h-screen antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
