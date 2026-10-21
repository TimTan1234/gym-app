"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

// Camera and pose model are browser-only, and MediaPipe is a large bundle, so load it on demand.
export const FormCheckLazy = dynamic(() => import("./FormCheck").then((m) => m.FormCheck), {
  ssr: false,
  loading: () => <Skeleton className="h-[min(133vw,calc(100dvh-15rem))] min-h-80 sm:aspect-video sm:h-auto sm:min-h-0" />,
});
