import { SiteShell } from "@/components/shared/SiteShell";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
