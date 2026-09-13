import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-base)] p-4">
      <div className="w-full max-w-md flex flex-col items-center">
        <h1 className="text-2xl font-bold tracking-tight text-[#1fb622] mb-6">
          Mergo
        </h1>
        <SignUp
          appearance={{
            elements: {
              card: "bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-none rounded-lg",
              headerTitle: "text-[var(--text-primary)]",
              headerSubtitle: "text-[var(--text-muted)]",
              socialButtonsBlockButton:
                "bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]",
              formButtonPrimary:
                "bg-[#1fb622] hover:bg-[#cff0c5] hover:text-[#060606] text-[#060606] font-medium transition-colors rounded-lg",
              formFieldInput:
                "bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg focus:border-[#1fb622]",
              formFieldLabel: "text-[var(--text-muted)]",
              footerActionLink: "text-[#1fb622] hover:text-[#cff0c5]",
              identityPreviewText: "text-[var(--text-primary)]",
              identityPreviewEditButton: "text-[#1fb622] hover:text-[#cff0c5]",
            },
          }}
        />
      </div>
    </main>
  );
}
