import Link from "next/link";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { buttonClass } from "@/components/ui";

// A plausible day so far (breakfast roti canai + lunch nasi lemak).
const SAMPLE = {
  totals: { kcal: 1885, proteinG: 79, carbsG: 214, fatG: 81, fiberG: 14, sugarG: 41, sodiumMg: 2650 },
  targets: { targetKcal: 2600, targetProteinG: 150, targetCarbsG: 320, targetFatG: 75 },
};

const FEATURES = [
  { term: "Meals", body: "Type what you ate or take a photo. AI lists each item with calories, protein, carbs, fat, fiber, sugar and sodium, and you adjust the grams before saving. It knows roti canai from roti john." },
  { term: "Workouts", body: "Log sets in a couple of taps. You see what you lifted last time, a suggested next weight, and a rest timer that starts on its own. New records are flagged as you set them." },
  { term: "Plans", body: "Tell it your goal, days per week, session length, equipment and any injuries. You get a plan built from a real exercise library, and you can edit every set." },
  { term: "Progress", body: "Body-weight trend, calories and protein against target, sets per muscle and strength over time." },
  { term: "Coach", body: "Ask about your training or eating. The coach reads your logs, and can propose new targets or a new plan that only change when you approve them." },
];

export default function Home() {
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <span className="score text-[30px]">GymPal</span>
        <Link href="/sign-in" className={buttonClass("ghost", "sm")}>
          Sign in
        </Link>
      </header>

      <section className="grid items-end gap-10 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <h1 className="display max-w-[14ch] text-[44px] sm:text-[60px]" style={{ lineHeight: 0.98 }}>
            Log what you eat and what you lift.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-steel">
            Describe a meal or snap a photo and AI works out the calories and macros. Your workouts, training plan and progress sit right
            next to it.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/sign-up" className={buttonClass("primary", "lg")}>
              Create account
            </Link>
            <Link href="/sign-in" className={buttonClass("secondary", "lg")}>
              Sign in
            </Link>
          </div>
        </div>

        <figure className="rounded-[14px] bg-paper p-5">
          <MacroSummary totals={SAMPLE.totals} targets={SAMPLE.targets} />
          <figcaption className="mt-4 border-t border-line pt-3 text-[13px] text-steel">
            A sample day. Each plate is the calories from protein, carbs or fat; the collar is your target.
          </figcaption>
        </figure>
      </section>

      <dl className="mt-20 divide-y divide-line border-y border-line">
        {FEATURES.map((f) => (
          <div key={f.term} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="display text-[22px]">{f.term}</dt>
            <dd className="max-w-[62ch] text-steel">{f.body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-[13px] text-steel">Nutrition estimates are approximate and not medical advice.</p>
    </main>
  );
}
