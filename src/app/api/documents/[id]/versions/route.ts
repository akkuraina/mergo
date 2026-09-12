import { NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createDocument,
  applyOp,
  getVisibleText,
  deserializeOp,
  type RGAOp,
} from "@/lib/crdt/rga";

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
    const body: { label?: string | null } = await request.json().catch(() => ({}));
    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : null;

    const supabase = createServerSupabaseClient();

    // 1. Fetch all operations for this doc ordered by clock ASC, id ASC
    const { data: ops, error: opsError } = await supabase
      .from("operations")
      .select("*")
      .eq("doc_id", id)
      .order("clock", { ascending: true })
      .order("id", { ascending: true });

    if (opsError) {
      console.error("Failed to fetch operations for version:", opsError);
      return Response.json({ error: opsError.message }, { status: 500 });
    }

    // 2. Replay ops through applyOp
    const parsedOps: RGAOp[] = [];
    let lastOpId = 0;
    if (ops && ops.length > 0) {
      for (const row of ops) {
        if (row.id > lastOpId) lastOpId = row.id;
        if (row.op_type === "snapshot") continue;
        try {
          const op: RGAOp =
            typeof row.payload === "string"
              ? deserializeOp(row.payload)
              : deserializeOp(JSON.stringify(row.payload));
          if (op && (op.type === "insert" || op.type === "delete")) {
            parsedOps.push(op);
          }
        } catch (err) {
          console.error("Error parsing op during version creation:", err);
        }
      }
    }

    let doc = createDocument("version-save");
    let pending = parsedOps;
    let progress = true;
    while (progress && pending.length > 0) {
      progress = false;
      const stillPending: RGAOp[] = [];
      for (const op of pending) {
        try {
          doc = applyOp(doc, op);
          progress = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("Predecessor not found")) {
            stillPending.push(op);
          }
        }
      }
      pending = stillPending;
    }

    const snapshot_text = getVisibleText(doc);
    const op_cursor = lastOpId;

    const userName =
      user.fullName ||
      `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
      user.username ||
      "Collaborator";
    const userImage = user.imageUrl || null;

    const { data: newVersion, error: insertError } = await supabase
      .from("versions")
      .insert({
        doc_id: id,
        label,
        snapshot_text,
        created_by: user.id,
        created_by_name: userName,
        created_by_image: userImage,
        op_cursor,
      })
      .select("*")
      .single();

    if (insertError || !newVersion) {
      console.error("Failed to insert version:", insertError);
      return Response.json(
        { error: insertError?.message ?? "Failed to save version" },
        { status: 500 }
      );
    }

    return Response.json(newVersion, { status: 201 });
  } catch (err) {
    console.error("Error saving version:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing document ID" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: versions, error } = await supabase
      .from("versions")
      .select("*")
      .eq("doc_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch versions:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(versions || [], { status: 200 });
  } catch (err) {
    console.error("Error fetching versions:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
