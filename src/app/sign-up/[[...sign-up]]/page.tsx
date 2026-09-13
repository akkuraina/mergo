import { SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { MergoWordmark } from "@/components/MergoWordmark";

export default function SignUpPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
        flexDirection: "column",
        gap: "32px",
      }}
    >
      {/* Brand above the Clerk box */}
      <MergoWordmark size="lg" />

      <SignUp
        appearance={{
          theme: dark,
          variables: {
            colorPrimary: "#1fb622",
            colorPrimaryForeground: "#060606",
            colorBackground: "#0d0d0d",
            colorInput: "#111111",
            colorInputForeground: "#eeeeee",
            colorForeground: "#eeeeee",
            colorMutedForeground: "#aaaaaa",
            colorNeutral: "#333333",
            borderRadius: "8px",
            fontFamily: "GeistSans, sans-serif",
          },
          elements: {
            card: {
              border: "1px solid #1a1a1a",
              boxShadow: "none",
              background: "#0d0d0d",
            },
            headerTitle: {
              color: "#eeeeee",
              fontFamily: '"Playfair Display", serif',
              fontSize: "22px",
            },
            headerSubtitle: {
              color: "#aaaaaa",
            },
            socialButtonsBlockButton: {
              background: "#111111",
              border: "1px solid #222222",
              color: "#eeeeee",
            },
            socialButtonsBlockButtonText: {
              color: "#eeeeee",
            },
            dividerLine: {
              background: "#222222",
            },
            dividerText: {
              color: "#555555",
            },
            formFieldInput: {
              background: "#111111",
              border: "1px solid #222222",
              color: "#eeeeee",
            },
            formFieldLabel: {
              color: "#aaaaaa",
            },
            footerActionLink: {
              color: "#1fb622",
            },
            identityPreviewText: {
              color: "#eeeeee",
            },
            formButtonPrimary: {
              background: "#1fb622",
              color: "#060606",
              fontWeight: "600",
            },
          },
        }}
      />
    </main>
  );
}
