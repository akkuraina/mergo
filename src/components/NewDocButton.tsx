"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NewDocButtonProps {
  className?: string;
}

export default function NewDocButton({ className = "" }: NewDocButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Error creating document:", errorData);
        setLoading(false);
        return;
      }

      const data: { id: string; title: string } = await res.json();
      router.push(`/doc/${data.id}`);
    } catch (err) {
      console.error("Failed to create document:", err);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className={`inline-flex items-center justify-center rounded-lg bg-[#1fb622] px-4 py-2 text-sm font-medium text-[#060606] transition-colors hover:bg-[#cff0c5] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? "Creating..." : "New document"}
    </button>
  );
}
