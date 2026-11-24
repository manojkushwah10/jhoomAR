import { Suspense } from "react"
import type { Metadata } from "next"
import { requireAdminPage } from "@/lib/admin-session"
import { SignOutButton } from "@/components/admin/sign-out-button"

export const metadata: Metadata = { title: "Dashboard" }

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Welcome />
      </Suspense>
    </main>
  )
}

async function Welcome() {
  const session = await requireAdminPage()
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl">Welcome, {session.user.name}</h1>
        <SignOutButton />
      </div>
      <p className="mt-6 rounded-xl border bg-card p-6 text-muted-foreground">
        Your products, 3D models, enquiries and settings will appear here soon.
      </p>
    </>
  )
}
