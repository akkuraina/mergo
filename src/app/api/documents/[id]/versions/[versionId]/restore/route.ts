import { NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, versionId } = await params;
  if (!id || !versionId) {
    return Response.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();

    // 1. Fetch target version
    const { data: targetVersion, error: versionError } = await supabase
      .from("versions")
      .select("*")
      .eq("id", versionId)
      .eq("doc_id", id)
      .single();

    if (versionError || !targetVersion) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    // 2. Restore Tiptap JSON to documents table
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        tiptap_content: targetVersion.tiptap_content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to restore document tiptap_content:", updateError);
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Save a new version snapshot marking this as a restore point
    const dateStr = new Date(targetVersion.created_at).toLocaleString();
    const restoreLabel = `Restored from ${targetVersion.label || dateStr}`;

    const userName =
      user.fullName ||
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.username ||
      "Collaborator";
    const userImage = user.imageUrl || null;

    const { data: newVersion, error: newVersionError } = await supabase
      .from("versions")
      .insert({
        doc_id: id,
        label: restoreLabel,
        snapshot_text: targetVersion.snapshot_text,
        tiptap_content: targetVersion.tiptap_content,
        created_by: user.id,
        created_by_name: userName,
        created_by_image: userImage,
        op_cursor: targetVersion.op_cursor ?? 0,
      })
      .select("*")
      .single();

    if (newVersionError) {
      console.error("Failed to record restored version snapshot:", newVersionError);
    }

    return Response.json(
      { ok: true, newVersionId: newVersion?.id ?? null },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error restoring version:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
