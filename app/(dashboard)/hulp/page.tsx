'use client'

// Hulp: "Hoe doe ik…?" — short how-tos with the mistakes people actually make.
// The content lives in lib/help.ts, shared with the printed guides.
//
// Each role sees its own articles (an admin also the teacher ones). The search
// matches every word anywhere in an article, accents ignored, so "examen telt
// niet" finds the exam article from its "Let op" lines too.

import { useEffect, useMemo, useState } from 'react'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import {
  HELP_ARTICLES, HELP_CATEGORIES, AUDIENCE_LABEL, audiencesFor, searchArticles,
  type HelpArticle, type HelpAudience,
} from '@/lib/help'
import { HelpCircle, Search, ChevronDown, AlertTriangle, Wrench, X } from 'lucide-react'

export default function HulpPage() {
  const { profile, loading } = useProfile()
  const [query, setQuery] = useState('')
  const [audience, setAudience] = useState<HelpAudience | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const audiences = audiencesFor(profile?.role)
  const current = audience && audiences.includes(audience) ? audience : audiences[0]

  // A link to /hulp#examen opens that article.
  // Also on hashchange: following a /hulp#… link while already on /hulp does
  // not reload the page.
  useEffect(() => {
    if (!profile) return
    const openFromHash = () => {
      const id = window.location.hash.slice(1)
      const a = HELP_ARTICLES.find(x => x.id === id)
      if (!a) return
      setQuery('')
      setOpen(new Set([id]))
      const other = audiencesFor(profile.role).find(x => a.for.includes(x))
      if (other) setAudience(other)
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 0)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [profile])

  const mine = useMemo(() => HELP_ARTICLES.filter(a => a.for.includes(current)), [current])
  const found = useMemo(() => searchArticles(mine, query), [mine, query])
  const searching = query.trim().length > 0

  if (loading) return <PageLoader />

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // A short result list is what someone searched for: show it unfolded.
  const isOpen = (id: string) => open.has(id) || (searching && found.length <= 3)

  return (
    <div className="animate-slide-up max-w-3xl">
      <div className="mb-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
          <HelpCircle size={22} />
        </div>
        <div>
          <h1 className="page-title">Hulp</h1>
          <p className="page-subtitle">Hoe doe ik…? Zoek een uitleg, of blader per onderwerp.</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" enterKeyHint="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Bv. examen telt niet mee, wachtwoord kwijt, huiswerk te laat…"
          aria-label="Zoek in de hulp"
          className="input w-full pl-9 pr-9"
        />
        {searching && (
          <button onClick={() => setQuery('')} aria-label="Zoekopdracht wissen"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
            <X size={15} />
          </button>
        )}
      </div>

      {audiences.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5" role="tablist">
          {audiences.map(a => (
            <button key={a} role="tab" aria-selected={a === current} onClick={() => setAudience(a)}
              className={a === current ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
              {AUDIENCE_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      {searching && (
        <p className="text-sm text-gray-500 mb-3">
          {found.length === 0
            ? 'Niets gevonden. Probeer een ander woord, of vraag het aan het bestuur.'
            : `${found.length} ${found.length === 1 ? 'uitleg' : 'uitleggen'} gevonden.`}
        </p>
      )}

      {HELP_CATEGORIES.map(cat => {
        const list = found.filter(a => a.category === cat)
        if (!list.length) return null
        return (
          <section key={cat} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-2">{cat}</h2>
            <div className="card divide-y divide-border overflow-hidden">
              {list.map(a => <Article key={a.id} a={a} open={isOpen(a.id)} onToggle={() => toggle(a.id)} />)}
            </div>
          </section>
        )
      })}

      <p className="text-xs text-gray-400 mt-8">
        Staat je vraag er niet bij, of werkt iets niet zoals hier staat? Geef het door aan het bestuur.
      </p>
    </div>
  )
}

function Article({ a, open, onToggle }: { a: HelpArticle; open: boolean; onToggle: () => void }) {
  return (
    <div id={a.id}>
      <button onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className="font-medium text-sm text-gray-800">{a.title}</span>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-700 space-y-3">
          {a.intro && <p>{a.intro}</p>}
          {a.steps && (
            <ol className="list-decimal pl-5 space-y-1.5">
              {a.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {a.letOp && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1">
                <AlertTriangle size={14} /> Let op
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-900">
                {a.letOp.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {a.lukt && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="flex items-center gap-1.5 font-semibold text-gray-800 mb-1">
                <Wrench size={14} /> Als het niet lukt
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {a.lukt.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
