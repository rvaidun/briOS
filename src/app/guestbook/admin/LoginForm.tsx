"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import { login } from "./actions";

export function LoginForm({ error }: { error?: boolean }) {
  return (
    <form action={login} className="flex flex-col gap-3">
      <label className="text-secondary text-sm">Admin password</label>
      <Input type="password" name="password" autoFocus required />
      {error && <p className="text-sm text-red-600 dark:text-red-400">Wrong password.</p>}
      <Button type="submit">Sign in</Button>
    </form>
  );
}
