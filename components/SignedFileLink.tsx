'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Loader2 } from 'lucide-react'

interface Props {
    bucket: 'submission-files' | 'module-documents' | 'student-documents' | 'tenant-documents'
    path: string
    className?: string
    children: React.ReactNode
}

function extractPath(value: string, bucket: string): string {
    // Legacy support: if stored value is a full public URL, extract just the path
    const marker = `/object/public/${bucket}/`
    const idx = value.indexOf(marker)
    return idx !== -1 ? value.slice(idx + marker.length) : value
}

// Signing is slow enough to matter: measured 6-29 s for an authenticated caller
// against 79-320 ms for the service role on the same object, so the cost is RLS
// evaluation on storage.objects, not the file. Two consequences are handled here.
//
// 1. `window.open()` AFTER the await is blocked. A popup is only allowed while
//    the click still counts as user activation, and that is long gone after
//    thirty seconds. It returns null silently, `signErr` is null, so nothing
//    opened and nothing was reported — "blijft draaien en stopt daarna gewoon,
//    pdf gaat niet open" (De Kroon, 2026-09-16). The tab is therefore claimed
//    synchronously, before any awaiting, and only pointed at the URL later.
// 2. A wait that long with no feedback reads as broken, so say something.

export function SignedFileLink({ bucket, path, className, children }: Props) {
    const [busy, setBusy] = useState(false)
    const [slow, setSlow] = useState(false)
    const [error, setError] = useState('')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    async function open(e: React.MouseEvent<HTMLAnchorElement>) {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        setSlow(false)
        timer.current = setTimeout(() => setSlow(true), 2500)

        // Claim the tab now, while the click still authorises it. No `noopener`
        // here on purpose: with it the browser returns null and we could never
        // point the tab anywhere. The child's back-reference is cleared instead.
        let tab: Window | null = null
        try {
            tab = window.open('', '_blank')
            if (tab) tab.opener = null
        } catch { tab = null }

        const storagePath = extractPath(path, bucket)
        const { data, error: signErr } = await supabase
            .storage.from(bucket).createSignedUrl(storagePath, 300)

        if (timer.current) clearTimeout(timer.current)
        setBusy(false)
        setSlow(false)

        if (signErr || !data?.signedUrl) {
            console.error(signErr)
            tab?.close()
            setError('Bestand kon niet worden geopend.')
            return
        }

        if (tab && !tab.closed) {
            tab.location.href = data.signedUrl
        } else {
            // Popups blocked, or the user closed the placeholder. Same-tab
            // navigation is never blocked, so the file still opens.
            window.location.assign(data.signedUrl)
        }
    }

    return (
        <span className="inline-flex flex-col">
            <a href="#" onClick={open} className={className} aria-busy={busy}>
                {children}
                {busy && <Loader2 size={13} className="animate-spin inline ml-1.5 align-[-2px]" />}
            </a>
            {slow && <span className="text-xs text-gray-500 mt-0.5">Bestand wordt geopend, even geduld…</span>}
            {error && <span className="text-xs text-red-600 mt-0.5">{error}</span>}
        </span>
    )
}
