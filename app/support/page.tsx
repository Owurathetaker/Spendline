export default function SupportPage() {
  const email = "broadbinbiz@gmail.com";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Support</h1>
        <p className="mt-2 text-sm text-slate-600">
          Need help with Spendline? Email us and we’ll respond as soon as possible.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-500">Support email</p>

          <a
            href={`mailto:${email}?subject=Spendline%20Support`}
            className="mt-2 inline-block text-sm font-bold underline"
          >
            {email}
          </a>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold">To help us resolve it faster</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>What you were trying to do</li>
              <li>What happened (error message if any)</li>
              <li>Your device (iPhone/Android) + app version (if known)</li>
              <li>A screenshot (optional)</li>
            </ul>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Tip: If it’s a password issue, try{" "}
          <span className="font-semibold">Reset Password</span> from the login screen.
        </p>
      </div>
    </main>
  );
}