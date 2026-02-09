import Link from "next/link";

export default function ReportDetailPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">One-Shot Analysis Mode</h1>
      <p className="mt-3 text-slate-700">
        Reports are not persisted. Upload a replay, review coaching advice, then upload again when you want a new run.
      </p>
      <div className="mt-6">
        <Link href="/upload" className="text-sm font-medium text-brand-700 hover:underline">
          Go to replay upload
        </Link>
      </div>
    </main>
  );
}
