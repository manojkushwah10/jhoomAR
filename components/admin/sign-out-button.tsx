"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      className="h-11 px-5 text-base"
      onClick={async () => {
        await authClient.signOut()
        router.replace("/admin/login")
      }}
    >
      Sign out
    </Button>
  )
}
