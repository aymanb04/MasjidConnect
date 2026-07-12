'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Crop, Loader2, Check } from 'lucide-react'

interface Props {
    logoUrl: string
    onChange: (url: string) => void
}

interface Box { x: number; y: number; size: number }

// Client only displays the (possibly cross-origin) logo and lets the user drag a
// square over the icon — no canvas read here (that would taint on cross-origin
// logos). The actual crop + upload happens server-side in /api/tenant/logo-icon.
export default function LogoIconCropper({ logoUrl, onChange }: Props) {
    const [open, setOpen]       = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError]     = useState('')
    const imgRef = useRef<HTMLImageElement>(null)
    const [disp, setDisp]       = useState({ w: 0, h: 0 })  // displayed image size (px)
    const [box, setBox]         = useState<Box>({ x: 0, y: 0, size: 0 }) // in display px

    function readDisp(): { w: number; h: number } {
        const el = imgRef.current
        return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 }
    }

    function onImgLoad() {
        const d = readDisp()
        setDisp(d)
        const size = Math.round(Math.min(d.w, d.h) * 0.8)
        setBox({ x: Math.round((d.w - size) / 2), y: Math.round((d.h - size) / 2), size })
    }

    function clamp(b: Box, d = disp): Box {
        const size = Math.max(24, Math.min(b.size, d.w, d.h))
        return {
            size,
            x: Math.max(0, Math.min(b.x, d.w - size)),
            y: Math.max(0, Math.min(b.y, d.h - size)),
        }
    }

    function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
        e.preventDefault()
        e.stopPropagation()
        const d = readDisp()
        const start = { sx: e.clientX, sy: e.clientY, box }
        const move = (ev: PointerEvent) => {
            const dx = ev.clientX - start.sx, dy = ev.clientY - start.sy
            if (mode === 'move') {
                setBox(clamp({ x: start.box.x + dx, y: start.box.y + dy, size: start.box.size }, d))
            } else {
                const delta = Math.max(dx, dy)
                setBox(clamp({ x: start.box.x, y: start.box.y, size: start.box.size + delta }, d))
            }
        }
        const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
    }

    async function handleCrop() {
        setLoading(true); setError('')
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/tenant/logo-icon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify({
                    logoUrl,
                    crop: { x: box.x / disp.w, y: box.y / disp.h, size: box.size / disp.w },
                }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || 'Uitsnijden mislukt.'); setLoading(false); return }
            onChange(data.url)
            setOpen(false)
        } catch {
            setError('Uitsnijden mislukt.')
        }
        setLoading(false)
    }

    if (!logoUrl) return null

    if (!open) {
        return (
            <button type="button" onClick={() => { setError(''); setOpen(true) }}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 active:text-primary-800">
                <Crop size={14} /> Icoon uitsnijden uit logo
            </button>
        )
    }

    const k = box.size > 0 ? 64 / box.size : 0

    return (
        <div className="mt-2 rounded-xl border border-border bg-gray-50 p-3">
            <p className="text-xs text-gray-500 mb-2">Sleep het kader over het beeldmerk; sleep de hoek om te vergroten.</p>
            <div className="flex flex-wrap items-start gap-4">
                <div className="relative inline-block select-none bg-white rounded-lg" style={{ touchAction: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img ref={imgRef} src={logoUrl} alt="" onLoad={onImgLoad}
                        className="block max-w-[280px] max-h-[180px] rounded-lg" draggable={false} />
                    {box.size > 0 && (
                        <div
                            className="absolute border-2 border-primary-600 cursor-move"
                            style={{ left: box.x, top: box.y, width: box.size, height: box.size, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
                            onPointerDown={e => startDrag(e, 'move')}
                        >
                            <div
                                className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-primary-600 border border-white cursor-se-resize"
                                onPointerDown={e => startDrag(e, 'resize')}
                            />
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-center gap-1.5">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-border bg-white flex-shrink-0">
                        {box.size > 0 && (
                            <div style={{
                                width: 64, height: 64,
                                backgroundImage: `url("${logoUrl}")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundSize: `${disp.w * k}px ${disp.h * k}px`,
                                backgroundPosition: `-${box.x * k}px -${box.y * k}px`,
                            }} />
                        )}
                    </div>
                    <span className="text-xs text-gray-400">Voorbeeld</span>
                </div>
            </div>

            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

            <div className="flex gap-2 mt-3">
                <button type="button" onClick={handleCrop} disabled={loading}
                    className="btn-primary h-9 px-4 justify-center text-sm">
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Uitsnijden &amp; gebruiken
                </button>
                <button type="button" onClick={() => setOpen(false)}
                    className="h-9 px-4 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Annuleren
                </button>
            </div>
        </div>
    )
}
