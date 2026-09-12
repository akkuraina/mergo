import { NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createDocument,
  localInsert,
  localDelete,
  applyOp,
  getVisibleText,
  deserializeOp,
  type RGAOp,
} from "@/lib/crdt/rga";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

function computeDiff(oldText: string, newText: string) {
  if (oldText === newText) return null;

  let start = 0;
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  ) {
    start++;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  const deleted = oldEnd - start;
  const insertedChars = newText.slice(start, newEnd).split("");

  if (deleted === 0 && insertedChars.length === 0) return null;

  return { start, deleted, insertedChars };
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

    const targetText = targetVersion.snapshot_text;

    // 2. Fetch all current operations for this doc
    const { data: ops, error: opsError } = await supabase
      .from("operations")
      .select("*")
      .eq("doc_id", id)
      .order("clock", { ascending: true })
      .order("id", { ascending: true });

    if (opsError) {
      console.error("Failed to fetch operations during restore:", opsError);
      return Response.json({ error: opsError.message }, { status: 500 });
    }

    // Replay current doc state
    let currentDoc = createDocument("restore-system");
    const parsedOps: RGAOp[] = [];
    let maxClock = 0;
    let lastOpId = 0;
    if (ops && ops.length > 0) {
      for (const row of ops) {
        if (row.id > lastOpId) lastOpId = row.id;
        if (row.clock > maxClock) maxClock = row.clock;
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
          console.error("Error parsing op during restore:", err);
        }
      }
    }

    let pending = parsedOps;
    let progress = true;
    while (progress && pending.length > 0) {
      progress = false;
      const stillPending: RGAOp[] = [];
      for (const op of pending) {
        try {
          currentDoc = applyOp(currentDoc, op);
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

    currentDoc.clock = Math.max(currentDoc.clock, maxClock + 1);

    const currentText = getVisibleText(currentDoc);
    const diff = computeDiff(currentText, targetText);

    const newOps: RGAOp[] = [];
    if (diff) {
      for (let i = 0; i < diff.deleted; i++) {
        const [newDoc, op] = localDelete(currentDoc, diff.start);
        currentDoc = newDoc;
        newOps.push(op);
      }
      for (let i = 0; i < diff.insertedChars.length; i++) {
        const [newDoc, op] = localInsert(
          currentDoc,
          diff.start + i,
          diff.insertedChars[i]
        );
        currentDoc = newDoc;
        newOps.push(op);
      }
    }

    // Persist new ops to operations table
    if (newOps.length > 0) {
      const rowsToInsert = newOps.map((op) => ({
        doc_id: id,
        op_type: op.type,
        payload: op,
        site_id: "restore-system",
        clock: op.type === "insert" ? op.node.id.clock : op.targetId.clock + 1,
      }));

      const { error: insertOpsError } = await supabase
        .from("operations")
        .insert(rowsToInsert);

      if (insertOpsError) {
        console.error("Failed to insert restore ops:", insertOpsError);
        return Response.json({ error: insertOpsError.message }, { status: 500 });
      }
    }

    // 6. Create a new version snapshot automatically labeled "Restored from [original label or date]"
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
        snapshot_text: targetText,
        created_by: user.id,
        created_by_name: userName,
        created_by_image: userImage,
        op_cursor: lastOpId,
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
