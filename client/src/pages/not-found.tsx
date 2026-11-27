import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="surface mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="mt-4 text-2xl font-extrabold">Page not found</h1>
      <p className="mt-1 text-muted-foreground">That page doesn't exist.</p>
      <Button asChild className="mt-6"><Link href="/">Go home</Link></Button>
    </div>
  );
}
