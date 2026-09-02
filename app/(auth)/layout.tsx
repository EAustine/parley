import { SiteShell } from "@/components/shared/SiteShell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
