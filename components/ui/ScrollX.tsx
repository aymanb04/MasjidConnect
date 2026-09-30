'use client'

// Een horizontaal scrollbare strook die zegt dat ze scrollbaar is.
//
// AANLEIDING (2026-09-27). Een leerkracht meldde "het werkt niet" bij het
// invullen van toetspunten. Op een telefoon klopte dat bijna: de puntentabel
// is breder dan het scherm, een nieuwe toetskolom kwam 76px buiten beeld te
// staan, en niets op het scherm verried dat er rechts nog iets stond. Je maakt
// een kolom aan, het scherm ziet er exact hetzelfde uit, en je concludeert dat
// de knop stuk is.
//
// Twee dingen lossen dat op, en ze horen bij elkaar:
//   * een schaduwrand rechts zolang er nog inhoud buiten beeld staat, zodat
//     zichtbaar is dat er meer is;
//   * `scrollToEndKey`: verandert die waarde, dan scrollt de strook naar het
//     einde. Wie een kolom toevoegt, ziet die kolom.
//
// De rand verdwijnt links/rechts naargelang waar je staat, en wordt helemaal
// niet getekend als alles toch al past -- op een laptop zie je hier niets van.

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
  /** Verandert deze waarde, dan scrollt de strook naar rechts. Bedoeld voor
   *  "er is net een kolom bijgekomen". */
  scrollToEndKey?: string | number
  /** Tekst van het duwtje dat één keer onder de strook verschijnt. */
  hint?: string
}

export function ScrollX({ children, className, scrollToEndKey, hint = 'Veeg opzij voor meer kolommen' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [meerRechts, setMeerRechts] = useState(false)
  const [meerLinks, setMeerLinks]   = useState(false)

  const meet = useCallback(() => {
    const el = ref.current
    if (!el) return
    // 2px speling: sub-pixel breedtes maken anders een rand die altijd aan staat.
    setMeerRechts(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    setMeerLinks(el.scrollLeft > 2)
  }, [])

  useEffect(() => {
    meet()
    const el = ref.current
    if (!el) return
    // Inhoud die later binnenkomt (een tabel vult zich na het laden) verandert
    // de breedte zonder scroll-event, vandaar de observer.
    const ro = new ResizeObserver(meet)
    ro.observe(el)
    for (const kind of Array.from(el.children)) ro.observe(kind)
    window.addEventListener('resize', meet)
    return () => { ro.disconnect(); window.removeEventListener('resize', meet) }
  }, [meet, children])

  useEffect(() => {
    if (scrollToEndKey === undefined) return
    const el = ref.current
    if (!el) return
    // Na de render waarin de kolom erbij kwam.
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
      setTimeout(meet, 400)
    })
    return () => cancelAnimationFrame(id)
  }, [scrollToEndKey, meet])

  return (
    <div className="relative">
      <div ref={ref} onScroll={meet} className={cn('overflow-x-auto', className)}>
        {children}
      </div>

      {/* Randen: puur decoratief, nooit klikbaar. */}
      {meerLinks && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/10 to-transparent" />
      )}
      {meerRechts && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/10 to-transparent" />
      )}
      {meerRechts && (
        <p className="px-4 py-1.5 text-[11px] text-gray-400 sm:hidden">{hint} →</p>
      )}
    </div>
  )
}
