import React from "react";

export function MergoWordmark({
  size = "md",
}: {
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: { container: "20px" },
    md: { container: "28px" },
    lg: { container: "48px" },
    xl: { container: "80px" },
  };

  return (
    <span
      style={{
        fontSize: sizes[size].container,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0px",
      }}
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
        Mer
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
        go
      </span>
    </span>
  );
}
