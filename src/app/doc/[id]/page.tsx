import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import DocClient from "./DocClient";
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

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const userId = user.id;
  const userName =
    user.fullName ||
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.username ||
    "Collaborator";
  const userImageUrl = user.imageUrl || "";

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
    <DocClient
      docId={id}
      initialTitle={document.title || "Untitled"}
      initialOps={initialOps}
      userId={userId}
      userName={userName}
      userImageUrl={userImageUrl}
    />
  );
}
