import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import CollabBar from "@/components/CollabBar";
import type { Document } from "@/lib/types";

interface DocPageProps {
  params: Promise<{ id: string }>;
}

export default async function DocPage({
  params,
}: DocPageProps): Promise<React.JSX.Element> {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !doc) {
    notFound();
  }

  const document = doc as Document;

  return (
    <div className="flex min-h-screen flex-col bg-[#060606] text-[#eeeeee]">
      {/* Header */}
      <header className="flex h-12 items-center justify-between border-b border-[#1a1a1a] px-6">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard"
            className="text-lg font-bold tracking-tight text-[#1fb622] hover:opacity-80"
          >
            Mergo
          </Link>
          <span className="text-sm text-[#1a1a1a]">/</span>
          <span className="text-xs text-[#aaaaaa]">Document</span>
        </div>
      </header>

      {/* Collaboration Bar */}
      <CollabBar docId={document.id} />

      {/* Document Workspace Area */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-8 py-10">
        <input
          type="text"
          defaultValue={document.title || "Untitled"}
          placeholder="Untitled"
          aria-label="Document title"
          className="w-full border-none bg-transparent text-3xl font-bold tracking-tight text-[#eeeeee] outline-none placeholder:text-[#aaaaaa]"
        />

        <div className="mt-10 flex flex-1 items-start justify-center rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-sm text-[#aaaaaa]">
          Editor initialises here — Phase 2
        </div>
      </main>
    </div>
  );
}
