import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/api-auth'
import { checkRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['student', 'teacher', 'admin', 'super_admin'])
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

  // Optional Discord webhook — set DISCORD_FEEDBACK_WEBHOOK_URL in Vercel env vars
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
            title:  `${emoji[feedbackType] ?? '📩'} ${feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1)} — MasjidConnect`,
            description: message.trim(),
            color: colour[feedbackType] ?? 0x1B6B4A,
            fields: [
              { name: 'Rol',   value: auth.caller.role,  inline: true },
              { name: 'Pagina', value: page_url ?? '—',  inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'MasjidConnect Feedback' },
          }],
        }),
      })
    } catch {
      // Fire-and-forget — don't fail the request if Discord is unreachable
    }
  }

  return NextResponse.json({ ok: true })
}
