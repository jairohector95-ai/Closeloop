import type { ReactNode } from "react";
import { AppGate } from "@/components/app/AppGate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppGate>{children}</AppGate>;
}
