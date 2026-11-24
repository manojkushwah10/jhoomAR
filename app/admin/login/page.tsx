import type { Metadata } from "next"
import { LoginForm } from "@/components/admin/login-form"
import { isAdminConfigured } from "@/lib/auth"

export const metadata: Metadata = { title: "Sign in" }

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <p className="font-serif text-3xl">JhoomAR</p>
      <h1 className="mt-1 mb-8 font-sans text-lg font-medium text-muted-foreground">
        Sign in to manage your shop
      </h1>
      {isAdminConfigured() ? (
        <LoginForm />
      ) : (
        <p role="status" className="rounded-xl border bg-card p-5 text-muted-foreground">
          Admin login isn&apos;t set up on this website yet. The shop pages work normally — admin will be switched on
          once the database is connected.
        </p>
      )}
    </main>
  )
}
