import { NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDocument, localInsert } from "@/lib/crdt/rga";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { userId } = getAuth(req);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing document ID" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Verify ownership
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("created_by, tiptap_content")
    .eq("id", id)
    .single();

  if (docError || !doc) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.created_by !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete all existing ops
  const { error: deleteError } = await supabase
    .from("operations")
    .delete()
    .eq("doc_id", id);

  if (deleteError) {
    console.error("Error deleting ops during reset:", deleteError);
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  // Extract plain text from tiptap_content
  let plainText = "";
  if (doc.tiptap_content) {
    plainText = extractPlainTextFromTiptap(
      doc.tiptap_content as Record<string, unknown>
    );
  }

  // Generate one insert op per character
  const RESET_SITE = "reset-" + id.slice(0, 8);
  let rgaDoc = createDocument(RESET_SITE);
  const opsToInsert = [];

  for (let i = 0; i < plainText.length; i++) {
    const [newDoc, op] = localInsert(rgaDoc, i, plainText[i]);
    rgaDoc = newDoc;
    opsToInsert.push({
      doc_id: id,
      op_type: op.type,
      payload: op,
      site_id: RESET_SITE,
      clock: op.node.id.clock,
    });
  }

  // Batch insert all clean ops
  if (opsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("operations")
      .insert(opsToInsert);

    if (insertError) {
      console.error("Error inserting clean ops during reset:", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, charCount: plainText.length });
}

// Extract plain text from Tiptap ProseMirror JSON
function extractPlainTextFromTiptap(json: Record<string, unknown>): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === "text") return (node.text as string) ?? "";
    const content = (node.content as Record<string, unknown>[]) ?? [];
    const childText = content.map(walk).join("");
    // Add \n between block-level nodes (paragraph, heading, etc.)
    const blockTypes = [
      "paragraph",
      "heading",
      "blockquote",
      "listItem",
      "bulletList",
      "orderedList",
    ];
    if (blockTypes.includes(node.type as string) && node.type !== "doc") {
      return childText + "\n";
    }
    return childText;
  }
  const result = walk(json).replace(/\n$/, ""); // trim trailing newline
  return result;
}
