import { NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing document ID" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();

    // Fetch document to verify existence and check creator
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, created_by")
      .eq("id", id)
      .single();

    if (docError || !doc) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const userId = user.id;

    // If owner, return role 'owner' early
    if (doc.created_by === userId) {
      return Response.json({ role: "owner", docId: id }, { status: 200 });
    }

    const userName =
      user.fullName ||
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.username ||
      "Collaborator";
    const userImage = user.imageUrl || null;

    // Upsert into collaborators table
    const { error: upsertError } = await supabase
      .from("collaborators")
      .upsert(
        {
          doc_id: id,
          user_id: userId,
          user_name: userName,
          user_image: userImage,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "doc_id,user_id" }
      );

    if (upsertError) {
      console.error("Failed to upsert collaborator:", upsertError);
      return Response.json(
        { error: upsertError.message ?? "Failed to join document" },
        { status: 500 }
      );
    }

    return Response.json(
      { role: "collaborator", docId: id },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error joining document as collaborator:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
