import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id, versionId } = await params;
  if (!id || !versionId) {
    return Response.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: version, error } = await supabase
      .from("versions")
      .select("*")
      .eq("id", versionId)
      .eq("doc_id", id)
      .single();

    if (error || !version) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    return Response.json(version, { status: 200 });
  } catch (err) {
    console.error("Error fetching single version:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
