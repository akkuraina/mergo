import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NewDocButton from "@/components/NewDocButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MergoWordmark } from "@/components/MergoWordmark";
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
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
        <div className="flex items-center space-x-6">
          <Link
            href="/dashboard"
            className="hover:opacity-80 transition-opacity flex items-center"
          >
            <MergoWordmark size="md" />
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <UserButton
            appearance={{
              theme: dark,
              variables: {
                colorBackground: "#0d0d0d",
                colorForeground: "#eeeeee",
                colorMutedForeground: "#aaaaaa",
                colorPrimary: "#1fb622",
              },
              elements: {
                userButtonAvatarBox: "h-8 w-8",
                userButtonPopoverCard:
                  "!bg-[#0d0d0d] !border !border-[#1a1a1a] !shadow-2xl !text-[#eeeeee]",
                userButtonPopoverActionButton:
                  "!text-[#eeeeee] hover:!bg-[#1a1a1a] hover:!text-white transition-colors",
                userButtonPopoverActionButtonText:
                  "!text-[#eeeeee] font-medium hover:!text-white",
                userButtonPopoverActionButtonIcon:
                  "!text-[#aaaaaa] hover:!text-white",
                userButtonPopoverFooter:
                  "!border-t !border-[#1a1a1a] !bg-[#0d0d0d]",
                userPreviewMainIdentifier:
                  "!text-[#eeeeee] font-semibold",
                userPreviewSecondaryIdentifier:
                  "!text-[#aaaaaa]",
              },
            }}
          />
          <span className="text-sm text-[var(--text-muted)]">
            {user.firstName || user.username || "User"}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            Your Documents
          </h2>
          <NewDocButton />
        </div>

        {isTotalEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center">
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              No documents created yet.
            </p>
            <NewDocButton />
          </div>
        ) : (
          <div className="space-y-10">
            {/* Section 1 — My documents */}
            {owned.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  My documents
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {owned.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/doc/${doc.id}`}
                      className="group flex flex-col justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-default)]"
                    >
                      <div>
                        <h3 className="font-medium text-[var(--text-primary)] truncate">
                          {doc.title || "Untitled"}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--text-faint)] font-mono truncate">
                          {doc.id}
                        </p>
                      </div>
                      <div className="mt-6 flex items-center justify-between text-xs text-[var(--text-muted)]">
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
                <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Shared with you
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCollab.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/doc/${doc.id}`}
                      className="group flex flex-col justify-between overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--border-default)]"
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <h3 className="font-medium text-[var(--text-primary)] truncate pr-2">
                            {doc.title || "Untitled"}
                          </h3>
                          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                            {new Date(
                              doc.updated_at || doc.created_at
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-faint)] font-mono truncate">
                          {doc.id}
                        </p>
                      </div>

                      {/* Banner strip */}
                      <div className="flex h-7 items-center border-t border-[var(--accent-border)] bg-[var(--accent-bg)] px-4 font-mono text-xs text-[var(--accent)]">
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
