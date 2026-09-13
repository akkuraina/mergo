"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "6px",
        border: "1px solid var(--border-default)",
        background: "transparent",
        color: "var(--text-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
        transition: "background 150ms ease, color 150ms ease",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
