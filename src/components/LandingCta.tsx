"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function HeroCtaGroup() {
  const { isSignedIn } = useAuth();
  const targetUrl = isSignedIn ? "/dashboard" : "/sign-in";

  const handleScrollToFeatures = (e: React.MouseEvent) => {
    e.preventDefault();
    const elem = document.getElementById("features");
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="hero-cta flex flex-wrap items-center justify-center gap-4">
      <Link
        href={targetUrl}
        className="inline-flex items-center justify-center px-[28px] py-[12px] rounded-[8px] text-[15px] font-semibold transition-transform duration-150"
        style={{
          background: "#1fb622",
          color: "#060606",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#18a11c";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#1fb622";
          e.currentTarget.style.transform = "translateY(0px)";
        }}
      >
        Start writing
      </Link>
      <button
        type="button"
        onClick={handleScrollToFeatures}
        className="inline-flex items-center justify-center px-[28px] py-[12px] rounded-[8px] text-[15px] transition-colors duration-150"
        style={{
          background: "transparent",
          border: "1px solid var(--border-default)",
          color: "var(--text-muted)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--text-muted)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-default)";
        }}
      >
        See how it works
      </button>
    </div>
  );
}

export function FinalCtaButton() {
  const { isSignedIn } = useAuth();
  const targetUrl = isSignedIn ? "/dashboard" : "/sign-in";

  return (
    <Link
      href={targetUrl}
      className="inline-flex items-center justify-center px-[28px] py-[12px] rounded-[8px] text-[15px] font-semibold transition-transform duration-150"
      style={{
        background: "#1fb622",
        color: "#060606",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#18a11c";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#1fb622";
        e.currentTarget.style.transform = "translateY(0px)";
      }}
    >
      Open Mergo →
    </Link>
  );
}
