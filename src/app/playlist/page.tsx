"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppFrame } from "@/components/app-frame";

function PlaylistPathRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    router.replace(q ? `/import?${q}` : "/import");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-muted-foreground">
      Redirecting to import…
    </div>
  );
}

/**
 * Compatibility URL: bookmarks and external links pointing at `/playlist` continue to work.
 */
export default function PlaylistPathRedirectPage() {
  return (
    <AppFrame contentClassName="max-w-xl">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
            Redirecting…
          </div>
        }
      >
        <PlaylistPathRedirectInner />
      </Suspense>
    </AppFrame>
  );
}
