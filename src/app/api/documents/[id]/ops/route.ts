import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RGAOp } from "@/lib/crdt/rga";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Missing document ID" }, { status: 400 });
  }

  try {
    const body: { op: RGAOp; siteId: string } = await request.json();
    const { op, siteId } = body;

    if (!op || !siteId) {
      return Response.json(
        { error: "Missing required fields op or siteId" },
        { status: 400 }
      );
    }

    const clock =
      op.type === "insert"
        ? op.node.id.clock
        : op.targetId?.clock ?? 0;

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("operations").insert({
      doc_id: id,
      op_type: op.type,
      payload: op,
      site_id: siteId,
      clock,
    });

    if (error) {
      console.error("Supabase insert operation error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Error processing operation POST:", err);
    return Response.json(
      { error: "Failed to process operation" },
      { status: 500 }
    );
  }
}
