"use client";

import React, { useEffect, useRef } from "react";

interface Feature {
  icon: string;
  title: string;
  body: string;
}

const features: Feature[] = [
  {
    icon: "⚡",
    title: "Real-time sync",
    body: "Two people, one doc, zero lag.",
  },
  {
    icon: "🔀",
    title: "Conflict-free merge",
    body: "RGA CRDT algorithm. Math, not magic.",
  },
  {
    icon: "📖",
    title: "Version history",
    body: "Every edit saved. Restore anything.",
  },
];

export function FeatureCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    cardRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="features"
      className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 w-full max-w-5xl px-6 py-12 md:py-20 mx-auto"
    >
      {features.map((feature, idx) => (
        <div
          key={feature.title}
          ref={(el) => {
            cardRefs.current[idx] = el;
          }}
          className="feature-card group rounded-[12px] p-[28px] transition-all duration-200"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            transitionDelay: `${idx * 100}ms`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#1fb622";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          <div className="text-[32px] text-[#1fb622] mb-4 select-none leading-none">
            {feature.icon}
          </div>
          <h3
            className="text-[20px] font-bold text-[var(--text-primary)] mb-2"
            style={{
              fontFamily: 'var(--font-playfair), "Playfair Display", serif',
            }}
          >
            {feature.title}
          </h3>
          <p className="text-[14px] text-[var(--text-muted)] leading-[1.6]">
            {feature.body}
          </p>
        </div>
      ))}
    </div>
  );
}
