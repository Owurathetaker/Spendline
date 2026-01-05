export default function PrivacyPage() {
  const email = "broadbinbiz@gmail.com";

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">
          This Privacy Policy explains how Spendline collects and uses information.
        </p>

        <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5">
          <section>
            <h2 className="text-sm font-extrabold">What we collect</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li><span className="font-semibold">Account info:</span> your email address (for login).</li>
              <li>
                <span className="font-semibold">App data you enter:</span> expenses, assets, budgets, and saving goals.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-extrabold">How we use it</h2>
            <p className="mt-2 text-sm text-slate-600">
              We use your information to provide core app features (sign-in, saving your entries,
              and showing your dashboard).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-extrabold">How it’s stored</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your data is stored securely in our database (Supabase). Access is restricted so users can only
              access their own data.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-extrabold">Sharing</h2>
            <p className="mt-2 text-sm text-slate-600">
              We do not sell your personal information. We only share data with service providers needed to run the app
              (for example, hosting and database).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-extrabold">Data deletion</h2>
            <p className="mt-2 text-sm text-slate-600">
              If you want your account and data deleted, email{" "}
              <a className="underline font-semibold" href={`mailto:${email}?subject=Spendline%20Data%20Deletion`}>
                {email}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-sm font-extrabold">Contact</h2>
            <p className="mt-2 text-sm text-slate-600">
              Questions? Email{" "}
              <a className="underline font-semibold" href={`mailto:${email}?subject=Spendline%20Privacy`}>
                {email}
              </a>
              .
            </p>
          </section>

          <p className="text-xs text-slate-500">
            Last updated: {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
    </main>
  );
}