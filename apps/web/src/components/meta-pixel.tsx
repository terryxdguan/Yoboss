"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { META_PIXEL_ID, trackPageView } from "@/lib/meta-pixel";

// Loads the Meta Pixel script and fires PageView on every client-side
// route change. Only mounted by <CookieConsent /> after the user
// accepts cookies — so just rendering this component is the consent
// signal. Renders nothing if NEXT_PUBLIC_META_PIXEL_ID is unset.
//
// useSearchParams() forces Suspense at the call site, so the route
// listener lives in a child component wrapped in <Suspense>.
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
        `}
      </Script>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
    </>
  );
}
