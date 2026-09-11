import { NextRequest } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<Response> {
  const { userId } = getAuth(request);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      title: "Untitled",
      created_by: userId,
    })
    .select("id, title")
    .single();

  if (error || !data) {
    console.error("Supabase insert document error:", error);
    return Response.json(
      { error: error?.message ?? "Failed to create document" },
      { status: 500 }
    );
  }

  return Response.json(
    { id: data.id, title: data.title },
    { status: 201 }
  );
}
