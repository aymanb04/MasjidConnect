'use client'

import { useEffect } from 'react'

/**
 * Locks page scrolling while a modal is open. The dashboard scrolls in an
 * inner container (`[data-scroll-container]` in the dashboard layout), not
 * the body, so both get locked — touch scrolls on a modal backdrop otherwise
 * chain into the page behind it.
 */
export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return
    const scroller = document.querySelector<HTMLElement>('[data-scroll-container]')
    const prevScroller = scroller?.style.overflow ?? ''
    const prevBody = document.body.style.overflow
    if (scroller) scroller.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      if (scroller) scroller.style.overflow = prevScroller
      document.body.style.overflow = prevBody
    }
  }, [active])
}
