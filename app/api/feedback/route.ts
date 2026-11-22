import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_MESSAGE_LEN = 4000

export async function POST(req: NextRequest) {
  // Staff only, like the button: pupil accounts (and the parents using them)
  // were writing to the school here, but this inbox is MasjidConnect's.
  const auth = await requireRole(req, ['teacher', 'admin', 'super_admin', 'leerlingenbegeleiding'])
  if ('error' in auth) return auth.error

  const rl = await checkRateLimit('/api/feedback', auth.caller.id)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Te veel verzoeken. Probeer later opnieuw.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
    )
  }

  const { type, message, page_url } = await req.json()

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Bericht is verplicht.' }, { status: 400 })
  }
  // Cap the payload. Without this any authenticated user can push an unbounded
  // string into the table. (The Discord ping below never carries the message.)
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `Bericht is te lang (max ${MAX_MESSAGE_LEN} tekens).` },
      { status: 400 }
    )
  }
  if (page_url != null && String(page_url).length > 500) {
    return NextResponse.json({ error: 'Ongeldige pagina-URL.' }, { status: 400 })
  }

  const validTypes = ['bug', 'suggestie', 'vraag']
  const feedbackType = validTypes.includes(type) ? type : 'bug'

  // Save to DB
  const { error } = await supabaseAdmin.from('feedback').insert({
    tenant_id:  auth.caller.tenant_id ?? null,
    user_id:    auth.caller.id,
    user_role:  auth.caller.role,
    type:       feedbackType,
    message:    message.trim(),
    page_url:   page_url ?? null,
  })

  if (error) {
    console.error('[feedback] DB insert failed:', error.message)
    return NextResponse.json({ error: 'Opslaan mislukt.' }, { status: 500 })
  }

  // Optional Discord ping (DISCORD_FEEDBACK_WEBHOOK_URL in Vercel). It says
  // THAT feedback arrived and of which type, nothing else: the message, the
  // sender's role and the page URL stay in our own database (superadmin →
  // feedback). Discord is not a sub-processor in the DPA, and staff write
  // free text that can name pupils; page URLs can carry a pupil's id
  // (/dossiers/<uuid>). Review 2026-11-21, finding #4. Never add content here
  // without first adding Discord to legal/sub-verwerkers.md.
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL
  if (webhookUrl) {
    const emoji: Record<string, string> = { bug: '🐛', suggestie: '💡', vraag: '❓' }
    const colour: Record<string, number> = { bug: 0xEF4444, suggestie: 0xF59E0B, vraag: 0x3B82F6 }
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `${emoji[feedbackType] ?? '📩'} Nieuwe feedback (${feedbackType})`,
            description: 'Lees het bericht in MasjidConnect → Superadmin → Feedback.',
            color: colour[feedbackType] ?? 0x1B6B4A,
            timestamp: new Date().toISOString(),
          }],
        }),
      })
    } catch {
      // Fire-and-forget — don't fail the request if Discord is unreachable
    }
  }

  return NextResponse.json({ ok: true })
}
