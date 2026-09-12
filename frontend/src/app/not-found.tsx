import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-state">
      <span className="eyebrow">ARGUS / 404</span>
      <h1>Outside the investigation.</h1>
      <p>This workspace could not be found.</p>
      <Link href="/dashboard">Return to dashboard →</Link>
    </main>
  );
}
