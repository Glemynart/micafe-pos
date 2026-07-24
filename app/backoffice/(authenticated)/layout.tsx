import { PlatformGuard } from "@/components/backoffice/platform-guard";
import { PlatformShell } from "@/components/backoffice/platform-shell";

export default function BackofficeAuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <PlatformGuard><PlatformShell>{children}</PlatformShell></PlatformGuard>;
}

