import type { UserRole } from "@/lib/api"

export type Mode = "login" | "register"

export interface AuthFormValues {
  email: string
  role: UserRole
  firstName: string
  lastName: string
}
