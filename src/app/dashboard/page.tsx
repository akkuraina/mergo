import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NewDocButton from "@/components/NewDocButton";
import type { Document } from "@/lib/types";

type DashboardDoc = Document & {
  role: "owner" | "collaborator";
};

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const supabase = createServerSupabaseClient();

  // Fetch 1 — owned documents
  const { data: ownedDocs, error: ownedError } = await supabase
    .from("documents")
    .select("*")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (ownedError) {
    console.error("Supabase fetch owned documents error:", ownedError);
  }

  // Fetch 2 — collaborated documents
  const { data: collabRows, error: collabError } = await supabase
    .from("collaborators")
    .select("doc_id, joined_at, last_seen_at, documents(*)")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  if (collabError) {
    console.error("Supabase fetch collaborated documents error:", collabError);
  }

  // Extract documents from collabRows
  const rawCollabDocs = (collabRows ?? [])
    .map((row) => (row as unknown as { documents: Document | null }).documents)
    .filter((doc): doc is Document => Boolean(doc));

  // Tag each document with its role
  const owned: DashboardDoc[] = (ownedDocs ?? []).map((d) => ({
    ...(d as Document),
    role: "owner",
  }));

  const collab: DashboardDoc[] = rawCollabDocs.map((d) => ({
    ...d,
    role: "collaborator",
  }));

  // Merge — deduplicate by id (owner always takes precedence)
  const ownedIds = new Set(owned.map((d) => d.id));
  const filteredCollab = collab.filter((d) => !ownedIds.has(d.id));

  // Fetch creator info for collaborated documents
  const creatorIds = [...new Set(filteredCollab.map((d) => d.created_by))];
  const creatorMap: Record<string, string> = {};

  if (creatorIds.length > 0) {
    try {
      const client = await clerkClient();
      await Promise.all(
        creatorIds.map(async (creatorId) => {
          try {
            const creator = await client.users.getUser(creatorId);
            const name =
              creator.fullName ||
              `${creator.firstName ?? ""} ${creator.lastName ?? ""}`.trim() ||
              creator.username ||
              "Collaborator";
            creatorMap[creatorId] = name;
          } catch (err) {
            console.error(
              `Failed to fetch user info for creator ${creatorId}:`,
              err
            );
            creatorMap[creatorId] = "Collaborator";
          }
        })
      );
    } catch (err) {
      console.error("Failed to initialize clerkClient:", err);
    }
  }

  const isTotalEmpty = owned.length === 0 && filteredCollab.length === 0;

  return (
    <div className="min-h-screen bg-[#060606] text-[#eeeeee]">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#1a1a1a] px-6">
        <div className="flex items-center space-x-6">
          <Link
            href="/dashboard"
            className="text-xl font-bold tracking-tight text-[#1fb622]"
          >
            Mergo
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-[#aaaaaa]">
            {user.firstName || user.username || "User"}
          </span>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-8 w-8",
              },
            }}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#eeeeee]">
            Your Documents
          </h2>
          <NewDocButton />
        </div>

        {isTotalEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="mb-4 text-sm text-[#aaaaaa]">
              No documents created yet.
            </p>
            <NewDocButton />
          </div>
        ) : (
          <div className="space-y-10">
            {/* Section 1 — My documents */}
            {owned.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#aaaaaa]">
                  My documents
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {owned.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/doc/${doc.id}`}
                      className="group flex flex-col justify-between rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-4 transition-colors hover:border-[#333333]"
                    >
                      <div>
                        <h3 className="font-medium text-[#eeeeee] group-hover:text-white truncate">
                          {doc.title || "Untitled"}
                        </h3>
                        <p className="mt-1 text-xs text-[#aaaaaa] font-mono truncate">
                          {doc.id}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center justify-between text-xs text-[#aaaaaa]">
                        <span>
                          {new Date(
                            doc.updated_at || doc.created_at
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2 — Shared with you */}
            {filteredCollab.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#aaaaaa]">
                  Shared with you
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCollab.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/doc/${doc.id}`}
                      className="group flex flex-col justify-between overflow-hidden rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] transition-colors hover:border-[#333333]"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <h3 className="font-medium text-[#eeeeee] group-hover:text-white truncate pr-2">
                            {doc.title || "Untitled"}
                          </h3>
                          <span className="text-xs text-[#aaaaaa] whitespace-nowrap">
                            {new Date(
                              doc.updated_at || doc.created_at
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#aaaaaa] font-mono truncate">
                          {doc.id}
                        </p>
                      </div>

                      {/* Banner strip */}
                      <div className="flex h-7 items-center border-t border-[#1a2e1a] bg-[#0d1a0d] px-4 font-mono text-xs text-[#1fb622]">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#1fb622]" />
                        <span className="truncate">
                          Shared by{" "}
                          {creatorMap[doc.created_by] || "Collaborator"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
