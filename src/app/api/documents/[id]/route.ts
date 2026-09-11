import { NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { userId } = getAuth(request);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Missing document ID" }, { status: 400 });
  }

  try {
    const body: { title?: string } = await request.json();
    const { title } = body;

    if (typeof title !== "string") {
      return Response.json(
        { error: "Invalid title provided" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify creator
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, created_by")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      console.error("Supabase fetch document error:", fetchError);
      return Response.json(
        { error: fetchError?.message ?? "Document not found" },
        { status: 404 }
      );
    }

    if (doc.created_by !== userId) {
      return Response.json(
        { error: "Forbidden: Only the creator can rename this document" },
        { status: 403 }
      );
    }

    // Update title and updated_at
    const { data: updatedDoc, error: updateError } = await supabase
      .from("documents")
      .update({
        title: title.trim() || "Untitled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedDoc) {
      console.error("Supabase update document error:", updateError);
      return Response.json(
        { error: updateError?.message ?? "Failed to update document" },
        { status: 500 }
      );
    }

    return Response.json(updatedDoc, { status: 200 });
  } catch (err) {
    console.error("Error handling PATCH /api/documents/[id]:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
