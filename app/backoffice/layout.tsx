import type { Metadata } from "next";
import { PlatformProvider } from "@/contexts/platform-context";

export const metadata: Metadata = {
  title: "Backoffice · Dusema POS",
  description: "Portal de operación de la plataforma SaaS",
};

export default function BackofficeRootLayout({ children }: { children: React.ReactNode }) {
  return <PlatformProvider>{children}</PlatformProvider>;
}

