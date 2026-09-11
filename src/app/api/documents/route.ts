import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = getAuth(request);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { error: error?.message ?? "Failed to create document" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { id: data.id, title: data.title },
    { status: 201 }
  );
}
