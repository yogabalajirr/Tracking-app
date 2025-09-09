import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <h1 className="text-3xl font-bold mb-2">Calorie Tracker</h1>
      <p className="text-muted-foreground mb-6">Track calories, macros, exercise, and weight with a clean UI.</p>
      <div className="flex items-center justify-center gap-3">
        <Link className="underline" href="/login">Login</Link>
        <span className="text-muted-foreground">or</span>
        <Link className="underline" href="/signup">Create an account</Link>
      </div>
    </div>
  );
}
