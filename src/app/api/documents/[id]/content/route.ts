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
    const body = await request.json();
    const { tiptap_content } = body;

    console.log("PATCH /content called:", {
      docId: id,
      hasBody: !!tiptap_content,
      contentKeys: tiptap_content ? Object.keys(tiptap_content) : [],
    });

    if (!tiptap_content) {
      return Response.json({ error: "No content" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from("documents")
      .update({
        tiptap_content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Supabase update content error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Error handling PATCH /api/documents/[id]/content:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
