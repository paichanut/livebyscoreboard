import React from 'react'

// Shown on every route when the build has no Supabase keys. Rinkboard is cloud-only: every device
// (phone, TV, OBS) reads the same game from Supabase, so without it nothing can sync.
export default function Setup() {
  return (
    <div className="home setup">
      <h1>Rinkboard</h1>
      <h2>ยังไม่ได้ตั้งค่า cloud sync · Cloud sync not configured</h2>
      <p>
        เว็บนี้ถูก build โดยไม่มี Supabase keys จึงไม่มี server ให้มือถือ ทีวี และ OBS คุยกัน
        <br />This build has no Supabase keys, so there is no server for phones, TVs and OBS to share a game through.
      </p>
      <ol>
        <li>supabase.com → <b>New project</b></li>
        <li>SQL Editor → paste <code>supabase.sql</code> from the repo → <b>Run</b></li>
        <li>Project Settings → API → copy <b>Project URL</b> and <b>anon public</b> key</li>
        <li>Vercel → project → Settings → <b>Environment Variables</b> (Production):
          <pre>VITE_SUPABASE_URL = https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY = eyJ…</pre>
        </li>
        <li>Deployments → <b>Redeploy</b>. This page is replaced by the scoreboard.</li>
      </ol>
      <div className="mode">cloud mode only · no local fallback</div>
    </div>
  )
}
