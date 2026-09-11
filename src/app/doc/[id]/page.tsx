import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Editor from "@/components/Editor";
import type { Document, Operation } from "@/lib/types";

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

  // Fetch document
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docError || !doc) {
    console.error("Supabase fetch document error:", docError);
    notFound();
  }

  // Fetch operations ordered by clock ASC
  const { data: ops, error: opsError } = await supabase
    .from("operations")
    .select("*")
    .eq("doc_id", id)
    .order("clock", { ascending: true });

  if (opsError) {
    console.error("Supabase fetch operations error:", opsError);
  }

  const document = doc as Document;
  const initialOps = opsError || !ops ? [] : (ops as Operation[]);

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

      {/* Editor with integrated CollabBar and real-time remote cursors */}
      <Editor
        document={document}
        initialOps={initialOps}
        initialTitle={document.title}
      />
    </div>
  );
}
