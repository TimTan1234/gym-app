import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Link href="/" className="score mb-10 text-[34px]">
        GymPal
      </Link>
      {children}
    </main>
  );
}
