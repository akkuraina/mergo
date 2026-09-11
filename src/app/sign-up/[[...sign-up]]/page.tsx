import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#060606] p-4">
      <div className="w-full max-w-md flex flex-col items-center">
        <h1 className="text-2xl font-bold tracking-tight text-[#1fb622] mb-6">
          Mergo
        </h1>
        <SignUp
          appearance={{
            elements: {
              card: "bg-[#0d0d0d] border border-[#1a1a1a] shadow-none rounded-lg",
              headerTitle: "text-[#eeeeee]",
              headerSubtitle: "text-[#aaaaaa]",
              socialButtonsBlockButton:
                "bg-[#141414] border border-[#1a1a1a] text-[#eeeeee] hover:bg-[#1a1a1a]",
              formButtonPrimary:
                "bg-[#1fb622] hover:bg-[#cff0c5] hover:text-[#060606] text-[#060606] font-medium transition-colors rounded-lg",
              formFieldInput:
                "bg-[#060606] border border-[#1a1a1a] text-[#eeeeee] rounded-lg focus:border-[#1fb622]",
              formFieldLabel: "text-[#aaaaaa]",
              footerActionLink: "text-[#1fb622] hover:text-[#cff0c5]",
              identityPreviewText: "text-[#eeeeee]",
              identityPreviewEditButton: "text-[#1fb622] hover:text-[#cff0c5]",
            },
          }}
        />
      </div>
    </main>
  );
}
