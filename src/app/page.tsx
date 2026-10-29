import { Suspense } from "react";
import Link from "next/link";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { buttonClass } from "@/components/ui";
import { getT } from "@/i18n/server";
import { LocaleBoundary } from "@/i18n/LocaleBoundary";

// A plausible day so far (breakfast roti canai + lunch nasi lemak).
const SAMPLE = {
  totals: { kcal: 1885, proteinG: 79, carbsG: 214, fatG: 81, fiberG: 14, sugarG: 41, addedSugarG: 28, sodiumMg: 2650 },
  targets: { targetKcal: 2600, targetProteinG: 150, targetCarbsG: 320, targetFatG: 75 },
};

const FEATURES = ["meals", "workouts", "plans", "progress", "coach"] as const;

export default function Home() {
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 pb-16">
      {/* The language comes from a cookie, so everything below the wordmark waits for it. */}
      <Suspense
        fallback={
          <header className="py-6">
            <span className="score text-[30px]">GymPal</span>
          </header>
        }
      >
        <LocaleBoundary>
          <Landing />
        </LocaleBoundary>
      </Suspense>
    </main>
  );
}

async function Landing() {
  const t = await getT();
  return (
    <>
      <header className="flex items-center justify-between py-6">
        <span className="score text-[30px]">GymPal</span>
        <Link href="/sign-in" className={buttonClass("ghost", "sm", "end")}>
          {t("landing.signIn")}
        </Link>
      </header>

      <section className="grid items-end gap-10 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <h1 className="display max-w-[14ch] text-[44px] sm:text-[60px]" style={{ lineHeight: 0.98 }}>
            {t("landing.headline")}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-steel">{t("landing.intro")}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/sign-up" className={buttonClass("primary", "lg")}>
              {t("landing.createAccount")}
            </Link>
            <Link href="/sign-in" className={buttonClass("secondary", "lg")}>
              {t("landing.signIn")}
            </Link>
          </div>
        </div>

        <figure className="rounded-card bg-paper p-5">
          <MacroSummary totals={SAMPLE.totals} targets={SAMPLE.targets} />
          <figcaption className="mt-4 border-t border-line pt-3 text-[13px] text-steel">
            {t("landing.sampleCaption")}
          </figcaption>
        </figure>
      </section>

      <dl className="mt-20 divide-y divide-line border-y border-line">
        {FEATURES.map((f) => (
          <div key={f} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="display text-[22px]">{t(`landing.features.${f}`)}</dt>
            <dd className="max-w-[62ch] text-steel">{t(`landing.features.${f}Body`)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-[13px] text-steel">{t("landing.disclaimer")}</p>
    </>
  );
}
