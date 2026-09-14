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
    const body: { op?: RGAOp; ops?: RGAOp[]; siteId: string } =
      await request.json();
    const { op, ops, siteId } = body;

    if ((!op && (!ops || ops.length === 0)) || !siteId) {
      return Response.json(
        { error: "Missing required fields op/ops or siteId" },
        { status: 400 }
      );
    }

    const opsList: RGAOp[] = ops && ops.length > 0 ? ops : op ? [op] : [];

    const rows = opsList.map((singleOp) => {
      const clock =
        singleOp.type === "insert"
          ? singleOp.node.id.clock
          : singleOp.type === "delete"
          ? singleOp.targetId.clock + 1
          : Date.now();

      return {
        doc_id: id,
        op_type: singleOp.type || "op",
        payload: singleOp,
        site_id: siteId,
        clock,
      };
    });

    // Use service-role client — bypasses RLS so all authenticated sites can write.
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("operations").insert(rows);

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
