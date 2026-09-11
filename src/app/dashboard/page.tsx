import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NewDocButton from "@/components/NewDocButton";
import type { Document } from "@/lib/types";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const supabase = createServerSupabaseClient();
  const { data: documents, error } = await supabase
    .from("documents")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase fetch documents error:", error);
  }

  const docList: Document[] = error || !documents ? [] : (documents as Document[]);

  return (
    <div className="min-h-screen bg-[#060606] text-[#eeeeee]">
      {/* Top Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#1a1a1a] px-6">
        <div className="flex items-center space-x-6">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight text-[#1fb622]">
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
          <h2 className="text-lg font-medium text-[#eeeeee]">Your Documents</h2>
          <NewDocButton />
        </div>

        {docList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-12 text-center">
            <p className="mb-4 text-sm text-[#aaaaaa]">
              No documents created yet.
            </p>
            <NewDocButton />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docList.map((doc) => (
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
                    {new Date(doc.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
