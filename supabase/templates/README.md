# Supabase Auth e-mail templates

These files are the **source of truth for the wording**, but they are **not applied
automatically**. This is a hosted Supabase project with no `config.toml`, so the live
templates live in the dashboard:

> Supabase → Authentication → Emails → *Invite user* / *Reset password*

Paste the file contents into the matching template's message body, and set the subject
line listed below. Keep this folder in sync whenever you edit one there, otherwise the
only copy of the wording is behind a login.

| File | Dashboard template | Subject line |
|---|---|---|
| `invite.html` | Invite user | `Uitnodiging MasjidConnect` |
| `recovery.html` | Reset password | `Wachtwoord opnieuw instellen — MasjidConnect` |

Mail is delivered through Resend (custom SMTP), sending as
`"MasjidConnect" <noreply@masjidconnect.be>`.

## Why `recovery.html` exists

Until 2026-08-22 the reset template was Supabase's untouched English default — subject
`Reset Your Password`. The invite template had been translated, the reset one had not,
and reset is the mail that actually reaches people: `inviteUserByEmail` refuses any
address that already has an account, so every existing user who needs access gets a
*recovery* mail, never an invite. De Kroon's teachers were onboarded by script, so all
12 of them only ever received the English one.

## Wording rules learned the hard way

- **Never name a validity period.** `Email OTP Expiration` is a dashboard setting that
  has already moved between `3600` and `86400`; any template that says "24 uur" silently
  becomes a lie. Say "beperkt geldig" and point at *Wachtwoord vergeten* instead.
- **Say that a new link kills the old one.** Sending a second reset invalidates the
  first, which is invisible to the recipient and caused real confusion on 2026-08-15.
- **Both templates land on `/reset-password`**, which since `e381c23` recognises an
  expired link and offers a one-tap route back to `/forgot-password`.

## Variables

`{{ .ConfirmationURL }}` is the only one used. It already carries `type=`,
`token=` and `redirect_to=`; the redirect target comes from the calling code
(`app/api/invite/route.ts` for invites, `app/forgot-password/page.tsx` for resets),
not from the template.
