import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · JhoomAR Admin" },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-full bg-muted/40 text-base">{children}</div>
}
