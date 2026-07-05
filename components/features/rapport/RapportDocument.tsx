'use client'

// Printable rapport (report card). Bilingual Arabic-RTL + Dutch, matching the
// De Kroon template. Rendering approach: HTML + browser print (Ctrl+P / the print
// button) — the browser shapes Arabic natively. Layout verified against the
// mosque's real rapport PDF (2026-07-05).

export interface RapportDocLine {
  subjectNl: string
  result: number | null
  comment: string
}

export interface RapportDocProps {
  schoolName: string
  schoolLines: string[]        // address / city / email lines under the name
  logoUrl?: string | null
  studentName: string
  level?: string
  schoolYearName: string
  semester: 1 | 2
  lines: RapportDocLine[]
}

// Known subjects → Arabic label (falls back to the Dutch name for anything else).
const ARABIC_SUBJECT: Record<string, string> = {
  arabisch: 'اللغة العربية',
  islam: 'التربية الإسلامية',
  koran: 'القرآن الكريم',
  quran: 'القرآن الكريم',
}
function arabicFor(nl: string): string | null {
  return ARABIC_SUBJECT[nl.trim().toLowerCase()] ?? null
}

function fmtResult(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  return `${Math.round(n * 10) / 10}%`
}

export default function RapportDocument({
  schoolName, schoolLines, logoUrl, studentName, level, schoolYearName, semester, lines,
}: RapportDocProps) {
  return (
    <>
      {/* Print isolation: only #rapport-print prints, app chrome hidden. */}
      <style>{`
        #rapport-print {
          --ink:#1f2937; --muted:#6b7280; --line:#d1d5db;
          --subject-bg:#faedcf; --subject-ink:#3f7a3a;
          --result-bg:#e7f0e0; --comment-bg:#eef4ea; --brand:#e8a13a;
          background:#fff; color:var(--ink);
          font-family:"Segoe UI","Noto Naskh Arabic","Amiri",Tahoma,sans-serif;
          direction:rtl; width:210mm; max-width:100%; margin:0 auto; padding:14mm;
          box-sizing:border-box;
        }
        #rapport-print *{ box-sizing:border-box; }
        #rapport-print .rp-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
        #rapport-print .rp-brand{ display:flex; align-items:center; gap:8px; }
        #rapport-print .rp-logo-txt{ font-weight:800; font-size:24px; letter-spacing:.5px; color:var(--brand); font-family:"Segoe UI",sans-serif; }
        #rapport-print .rp-logo-img{ height:40px; width:auto; }
        #rapport-print .rp-school{ text-align:left; font-size:13px; line-height:1.7; }
        #rapport-print .rp-school .rp-name{ font-size:15px; font-weight:700; }
        #rapport-print hr.rp-rule{ border:0; border-top:2px solid var(--ink); margin:10px 0 0; }
        #rapport-print .rp-meta{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:14px 0 20px; text-align:center; font-size:13px; }
        #rapport-print .rp-lab{ color:var(--muted); font-size:12px; }
        #rapport-print .rp-val{ font-weight:700; margin-top:4px; min-height:20px; border-bottom:1px solid var(--line); padding-bottom:4px; }
        #rapport-print table{ width:100%; border-collapse:separate; border-spacing:0 8px; }
        #rapport-print thead th{ background:#f3f4f6; padding:9px 12px; font-size:13px; font-weight:700; }
        #rapport-print thead th .rp-nl{ display:block; color:var(--muted); font-weight:600; font-size:12px; }
        #rapport-print td{ padding:12px; vertical-align:middle; }
        #rapport-print .rp-subject{ background:var(--subject-bg); width:26%; text-align:center; border-radius:6px; }
        #rapport-print .rp-subject .rp-ar{ color:var(--subject-ink); font-weight:800; font-size:16px; }
        #rapport-print .rp-subject .rp-nl2{ color:var(--subject-ink); font-weight:700; font-size:13px; }
        #rapport-print .rp-result{ background:var(--result-bg); width:16%; text-align:center; font-size:20px; font-weight:800; border-radius:6px; }
        #rapport-print .rp-comment{ background:var(--comment-bg); text-align:start; unicode-bidi:plaintext; border-radius:6px; font-size:13px; color:#374151; min-height:44px; }
        #rapport-print .rp-signs{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:56px; text-align:center; font-size:13px; color:var(--muted); }
        #rapport-print .rp-signs .rp-slot{ border-top:1px solid var(--ink); padding-top:8px; }
        #rapport-print .rp-signs small, #rapport-print .rp-school small{ color:var(--muted); }
        @media print {
          body * { visibility:hidden !important; }
          #rapport-print, #rapport-print * { visibility:visible !important; }
          #rapport-print { position:absolute; left:0; top:0; margin:0; padding:14mm; box-shadow:none; }
          @page { size:A4; margin:0; }
        }
      `}</style>

      <div id="rapport-print">
        <div className="rp-head">
          <div className="rp-brand">
            {logoUrl
              ? <img src={logoUrl} alt="" className="rp-logo-img" />
              : <span className="rp-logo-txt">{schoolName}</span>}
          </div>
          <div className="rp-school">
            <div className="rp-name">{schoolName}</div>
            {schoolLines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
        <hr className="rp-rule" />

        <div className="rp-meta">
          <div>
            <div className="rp-lab">العام الدراسيّ / Schooljaar</div>
            <div className="rp-val"><span dir="ltr">{schoolYearName}</span><br /><small>تقرير الفصل {semester} / Rapport semester {semester}</small></div>
          </div>
          <div>
            <div className="rp-lab">المستوى / Niveau</div>
            <div className="rp-val">{level || ' '}</div>
          </div>
          <div>
            <div className="rp-lab">اسم الطالب(ة) / Naam leerling</div>
            <div className="rp-val" style={{ gridColumn: 'span 2' }}>{studentName}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>الموضوع<span className="rp-nl">Vak</span></th>
              <th>النتائج<span className="rp-nl">Resultaat</span></th>
              <th>ملاحظات المعلّم(ة)<span className="rp-nl">Commentaar vakleerkracht</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, i) => {
              const ar = arabicFor(ln.subjectNl)
              return (
                <tr key={i}>
                  <td className="rp-subject">
                    {ar && <div className="rp-ar">{ar}</div>}
                    <div className="rp-nl2">{ln.subjectNl}</div>
                  </td>
                  <td className="rp-result">{fmtResult(ln.result)}</td>
                  <td className="rp-comment">{ln.comment}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="rp-signs">
          <div className="rp-slot">إمضاء منسّق التّعليم<br /><small>Handtekening coördinator</small></div>
          <div className="rp-slot">إمضاء المعلم(ون)<br /><small>Handtekening leerkracht</small></div>
          <div className="rp-slot">إمضاء وليّ الأمر<br /><small>Handtekening ouder</small></div>
        </div>
      </div>
    </>
  )
}
