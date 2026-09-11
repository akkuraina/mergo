import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function HomePage(): Promise<React.JSX.Element> {
  const { userId } = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#060606] px-4 text-center">
      <div className="max-w-md w-full flex flex-col items-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-[#1fb622]">
          Mergo
        </h1>
        <p className="text-sm text-[#aaaaaa]">
          Real-time collaborative text editor. Fast, minimal, and lightweight.
        </p>
        <div className="pt-2">
          {userId ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-[#1fb622] px-5 py-2.5 text-sm font-medium text-[#060606] transition-colors hover:bg-[#cff0c5]"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-lg bg-[#1fb622] px-5 py-2.5 text-sm font-medium text-[#060606] transition-colors hover:bg-[#cff0c5]"
            >
              Sign in to Mergo
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
