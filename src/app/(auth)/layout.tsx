import type { ReactNode } from "react";
import { Suspense } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
