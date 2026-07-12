import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Jimp, JimpMime } from 'jimp'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

// jimp needs the Node runtime (not edge).
export const runtime = 'nodejs'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Basic SSRF guard: the server fetches a super_admin-supplied URL, so only allow
// https and block loopback / private ranges reachable from the server.
function isSafeHttpUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(raw) } catch { return false }
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h.endsWith('.local') || h === '::1' || h === '0.0.0.0') return false
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
    return true
}

export async function POST(request: Request) {
    const auth = await requireRole(request, ['super_admin'])
    if ('error' in auth) return auth.error
    const { caller } = auth

    const rl = await checkRateLimit('/api/tenant/logo-icon', caller.id)
    if (rl.limited) {
        return NextResponse.json(
            { error: 'Te veel verzoeken. Probeer later opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
        )
    }

    try {
        const { logoUrl, crop } = await request.json()
        if (!isSafeHttpUrl(logoUrl ?? '')) {
            return NextResponse.json({ error: 'Ongeldige logo-URL.' }, { status: 400 })
        }
        // crop = { x, y, size } as fractions in [0,1] of the natural image
        const fx = Number(crop?.x), fy = Number(crop?.y), fsize = Number(crop?.size)
        if (![fx, fy, fsize].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || fsize <= 0) {
            return NextResponse.json({ error: 'Ongeldige uitsnede.' }, { status: 400 })
        }

        // Fetch the logo with a timeout; cap the download size.
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        let res: Response
        try {
            res = await fetch(logoUrl, { signal: ctrl.signal, redirect: 'follow' })
        } catch {
            return NextResponse.json({ error: 'Logo kon niet geladen worden.' }, { status: 400 })
        } finally {
            clearTimeout(timer)
        }
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
            return NextResponse.json({ error: 'URL is geen (geldige) afbeelding.' }, { status: 400 })
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.byteLength > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Afbeelding te groot (max 10 MB).' }, { status: 400 })
        }

        const img = await Jimp.read(buf)
        const W = img.width, H = img.height
        let size = Math.round(fsize * W)
        size = Math.max(1, Math.min(size, W, H))
        let x = Math.max(0, Math.min(Math.round(fx * W), W - size))
        let y = Math.max(0, Math.min(Math.round(fy * H), H - size))
        img.crop({ x, y, w: size, h: size })
        img.resize({ w: 256, h: 256 })
        const out = await img.getBuffer(JimpMime.png)

        const path = `icons/${crypto.randomUUID()}.png`
        const { error: upErr } = await supabaseAdmin.storage
            .from('tenant-logos')
            .upload(path, out, { contentType: 'image/png', upsert: true })
        if (upErr) {
            console.error('[/api/tenant/logo-icon] upload:', upErr.message)
            return NextResponse.json({ error: 'Opslaan van het icoon mislukte.' }, { status: 500 })
        }
        const { data } = supabaseAdmin.storage.from('tenant-logos').getPublicUrl(path)
        return NextResponse.json({ url: data.publicUrl })
    } catch (e: any) {
        console.error('[/api/tenant/logo-icon]', e.message)
        return NextResponse.json({ error: 'Er is een fout opgetreden.' }, { status: 500 })
    }
}
