export default function ReportDetailPage({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Report {params.id}</h1>
      <p className="mt-3 text-slate-700">
        Report persistence is planned for a later milestone. Use the upload flow to generate an in-session report.
      </p>
    </main>
  );
}
