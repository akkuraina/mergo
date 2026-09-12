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

    // clock column is used for replay ordering (ORDER BY clock ASC on mount).
    //
    // For inserts: use the op's own Lamport clock — causally correct because
    // inserts reference predecessors with strictly lower clocks.
    //
    // For deletes: use targetId.clock + 1.
    //   A delete can only happen AFTER the node it targets exists, so the
    //   delete MUST sort strictly after the insert that created the node
    //   (stored at targetId.clock).
    //
    //   The previous value of 0 caused ALL delete ops to sort before ALL
    //   insert ops on reload — every delete became a no-op (the target node
    //   didn't exist yet), so deleted content reappeared after a hard refresh.
    // For inserts: use the op's own Lamport clock.
    // For deletes: use targetId.clock + 1.
    // For snapshots / other ops: use Date.now().
    const clock =
      op.type === "insert"
        ? op.node.id.clock
        : op.type === "delete"
        ? op.targetId.clock + 1
        : Date.now();

    // Use service-role client — bypasses RLS so all authenticated sites can write.
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("operations").insert({
      doc_id: id,
      op_type: op.type || "op",
      payload: op,   // stored as JSONB — not stringified, not wrapped
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
