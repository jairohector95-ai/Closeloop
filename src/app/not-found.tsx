import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-6 text-center">
      <Logo />
      <h1 className="font-display mt-8 text-3xl font-semibold text-ink-900">That page doesn&apos;t exist.</h1>
      <p className="mt-2 max-w-sm text-ink-500">The link may be old, or the quote may have been deleted.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/dashboard" icon={<ArrowLeft className="h-4 w-4" />}>
          Go to dashboard
        </ButtonLink>
        <ButtonLink href="/" variant="outline">
          Home
        </ButtonLink>
      </div>
    </div>
  );
}
