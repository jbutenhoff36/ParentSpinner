import { useQuery } from "@tanstack/react-query";
import type { ChildProfile, Configuration } from "@shared/schema";
import { apiRequest } from "./queryClient";

export type Me = {
  id: number;
  username: string;
  displayName: string | null;
  role: "parent" | "child";
  parentId: number | null;
  email: string | null;
  joinCode: string | null;
  hasPassword: boolean;
  googleLinked: boolean;
};

export type ConsequenceType = "good" | "bad" | "fighting";

/** apiRequest errors look like `403: {"message":"..."}`; pull out the message. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/^\d+: (.*)$/s);
  if (match) {
    try {
      return JSON.parse(match[1]).message || fallback;
    } catch {
      return match[1] || fallback;
    }
  }
  return error.message || fallback;
}

/** The logged-in user, or null when logged out. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        return await apiRequest<Me>("GET", "/api/auth/me");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("401")) return null;
        throw e;
      }
    },
  });
}

export function useChildren(enabled = true) {
  return useQuery<ChildProfile[]>({ queryKey: ["/api/children"], enabled });
}

export function useConfig(enabled = true) {
  const q = useQuery<Configuration>({ queryKey: ["/api/config"], enabled });
  return { ...q, goodDaysRequired: q.data?.goodDaysRequired || 7 };
}

export function firstName(me: Me | null | undefined) {
  return (me?.displayName || me?.username || "").split(" ")[0];
}

/** Today's date as YYYY-MM-DD in the browser's time zone. */
export function dayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA");
}

export const TYPE_META: Record<ConsequenceType, { label: string; long: string; tone: string; soft: string; text: string }> = {
  good: { label: "Rewards", long: "Reward wheel", tone: "bg-reward", soft: "bg-reward-soft", text: "text-amber-700 dark:text-amber-300" },
  bad: { label: "Chores", long: "Chore wheel", tone: "bg-chore", soft: "bg-chore-soft", text: "text-sky-700 dark:text-sky-300" },
  fighting: { label: "Fighting", long: "Fighting wheel", tone: "bg-fight", soft: "bg-fight-soft", text: "text-rose-700 dark:text-rose-300" },
};
