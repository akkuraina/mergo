import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MergoWordmark } from "@/components/MergoWordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeatureCards } from "@/components/FeatureCards";
import { HeroCtaGroup, FinalCtaButton } from "@/components/LandingCta";
import "./landing.css";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col relative overflow-hidden">
      {/* Background Grid */}
      <div
        className="hero-bg pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      />

      {/* Section 1: Fullscreen Hero */}
      <section className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6 text-center">
        {/* Animated Wordmark Hero */}
        <div className="mb-4">
          <div
            className="hero-wordmark-wrap select-none text-[48px] sm:text-[64px] md:text-[80px]"
            style={{ lineHeight: 1 }}
          >
            <span
              style={{
                fontFamily: 'var(--font-playfair), "Playfair Display", serif',
                fontWeight: 700,
                fontStyle: "normal",
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              <span className="type-char type-char-1">M</span>
              <span className="type-char type-char-2">e</span>
              <span className="type-char type-char-3">r</span>
            </span>
            <span
              style={{
                fontFamily: 'var(--font-playfair), "Playfair Display", serif',
                fontWeight: 700,
                fontStyle: "italic",
                color: "#1fb622",
                letterSpacing: "-0.02em",
              }}
            >
              <span className="type-char type-char-4">g</span>
              <span className="type-char type-char-5">o</span>
            </span>
            <span className="type-cursor" style={{ marginLeft: "2px" }}>
              |
            </span>
          </div>
        </div>

        {/* Subtitle */}
        <p
          className="hero-subtitle mb-8 font-mono text-[14px] sm:text-[18px] text-[var(--text-muted)] tracking-tight"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          conflict-free, by design.
        </p>

        {/* CTA Group */}
        <HeroCtaGroup />

        {/* Scroll Hint */}
        <div className="hero-scroll-hint absolute bottom-8 left-1/2 -translate-x-1/2">
          <a
            href="#features"
            className="flex flex-col items-center gap-1 font-mono text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
          >
            <span>↓ scroll</span>
          </a>
        </div>
      </section>

      {/* Section 2: Feature Strip (Below the fold) */}
      <section className="relative z-10 w-full border-t border-[var(--border-subtle)] bg-[var(--bg-base)]">
        <FeatureCards />
      </section>

      {/* Section 3: Final CTA */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 py-16 sm:py-[120px] text-center bg-[var(--bg-base)] border-t border-[var(--border-subtle)]">
        <h2
          className="mb-8 text-[26px] sm:text-[32px] md:text-[40px] font-bold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-playfair), "Playfair Display", serif',
          }}
        >
          Ready to write together?
        </h2>
        <FinalCtaButton />
      </section>

      {/* Footer */}
      <footer className="relative z-10 flex h-[60px] w-full items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 sm:px-12">
        <div className="flex items-center">
          <MergoWordmark size="sm" />
        </div>
        <p
          className="font-mono text-[12px] text-[var(--text-faint)] hidden sm:block"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
          }}
        >
          conflict-free, by design.
        </p>
        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
