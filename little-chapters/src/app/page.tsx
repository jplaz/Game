import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

const STEPS = [
  {
    title: "Capture",
    body: "Photos, videos, voice notes, half-finished sentences at 2am. Whatever you have, however messy.",
  },
  {
    title: "Remember",
    body: "Little Chapters organizes everything automatically — dates, moments, milestones, the best of thousands of photos.",
  },
  {
    title: "Create",
    body: "One tap turns each month into a beautiful chapter: the story, the favorites, the firsts, the laugh you couldn't stop watching.",
  },
  {
    title: "Relive",
    body: "Order the printed book. Years later, scan a small code on the page — and the actual video of that laugh starts playing.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      <header className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
        <span className="font-display text-xl text-ink-700">Little Chapters</span>
        <nav className="flex items-center gap-2">
          <Link href="/pricing" className="px-3 py-2 text-sm text-ink-400 hover:text-ink-600">
            Pricing
          </Link>
          <Link href="/login" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Sign in
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-3xl px-6 pt-16 sm:pt-24 pb-16 text-center">
        <h1 className="text-4xl sm:text-6xl leading-[1.08] text-ink-700">
          They won&apos;t stay this little forever.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-ink-400 leading-relaxed max-w-xl mx-auto">
          Little Chapters turns the photos, videos, and little moments already
          on your phone into a childhood story you&apos;ll actually keep.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/login" className={buttonClass({ size: "lg" })}>
            Start Their Story
          </Link>
          <span className="text-sm text-ink-300">Private by default. Always yours.</span>
        </div>
      </section>

      {/* transformation */}
      <section className="mx-auto max-w-4xl px-6 pb-20">
        <div className="lc-card lc-grain p-8 sm:p-12">
          <div className="grid sm:grid-cols-3 items-center gap-6 text-center">
            <div>
              <p className="font-display text-lg text-ink-700">A messy camera roll</p>
              <p className="text-sm text-ink-300 mt-1">
                67 photos · 11 videos · 3 voice notes · a few scribbled lines
              </p>
            </div>
            <div className="text-clay-500 font-display text-2xl" aria-hidden>
              ↓&nbsp;&nbsp;Create This Month&nbsp;&nbsp;↓
            </div>
            <div>
              <p className="font-display text-lg text-ink-700">A finished chapter</p>
              <p className="text-sm text-ink-300 mt-1">
                the story of the month · the best moments · milestones · a video
                recap · a page in their book
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* steps */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="lc-card p-6">
              <p className="text-xs text-clay-600 font-medium">0{i + 1}</p>
              <h2 className="text-xl text-ink-700 mt-1">{step.title}</h2>
              <p className="text-sm text-ink-400 mt-2 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* the payoff */}
      <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
        <h2 className="text-3xl sm:text-4xl text-ink-700 leading-snug">
          Years from now, you open the book to{" "}
          <em className="text-clay-600 not-italic font-display">Six Months</em>.
        </h2>
        <p className="mt-5 text-ink-400 leading-relaxed">
          You see the photos. You read what life felt like. You scan a subtle
          little code on the page — and the actual video of your baby laughing
          starts playing. That&apos;s Little Chapters.
        </p>
        <div className="mt-8">
          <Link href="/login" className={buttonClass({ size: "lg" })}>
            Start Their Story
          </Link>
        </div>
      </section>

      <footer className="border-t border-sand-100">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-ink-300">
          <span>© {new Date().getFullYear()} Little Chapters</span>
          <div className="flex gap-5">
            <Link href="/pricing" className="hover:text-ink-500">Pricing</Link>
            <span>A childhood you don&apos;t accidentally forget.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
