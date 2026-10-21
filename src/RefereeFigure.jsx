import React, { useEffect, useId, useRef, useState } from 'react'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return reduced
}

function Motion({ frames, attributeName, value, transform = false }) {
  const props = { dur: '2.8s', repeatCount: 'indefinite', calcMode: 'linear',
    keyTimes: frames.map(f => f.at).join(';'), values: frames.map(value).join(';') }
  return transform
    ? <animateTransform attributeName="transform" type="translate" {...props} />
    : <animate attributeName={attributeName} {...props} />
}

function Hand({ kind }) {
  const style = { fill: '#efc8a8', stroke: '#172437', strokeWidth: 1.1 }
  if (kind === 'fist') return <circle r="3.4" {...style} />
  if (kind === 'flat') return <ellipse rx="5" ry="2.1" {...style} />
  if (kind === 'point') return <g {...style}><circle r="2.8" /><rect x="-1.1" y="-8.5" width="2.2" height="8" rx="1" /></g>
  if (kind === 'five') return <g {...style} strokeLinecap="round"><circle r="3.4" />{[-2, -1, 0, 1, 2].map(n => <path key={n} d={`M${n * 1.2},-1 L${n * 2.2},${-7.8 + Math.abs(n)}`} fill="none" stroke="#efc8a8" strokeWidth="1.8" />)}</g>
  return <ellipse rx="2.5" ry="4.7" {...style} />
}

// Native SVG interpolation stays crisp from small guide icons to a full-size TV announcement.
// No video/GIF download and no React timer is needed to start a penalty animation.
export default function RefereeFigure({ signal, playing = true, className = '', label, ignoreReducedMotion = false }) {
  const ref = useRef(null)
  const unique = useId().replace(/:/g, '')
  const reduced = useReducedMotion()
  const active = playing && (!reduced || ignoreReducedMotion)
  const frames = signal?.frames || [{ at: 0, left: [35, 48, 37, 63], right: [65, 48, 63, 63] }]
  const leg = signal?.stance === 'leg'
  const shoulders = leg ? [[51, 49], [69, 49]] : [[38, 33], [62, 33]]
  const first = frames[0]
  const hasMotion = frames.length > 1
  useEffect(() => {
    if (active) ref.current?.unpauseAnimations?.()
    else ref.current?.pauseAnimations?.()
  }, [active, signal?.id])
  return (
    <svg ref={ref} className={`referee-figure ${className}`} viewBox="-6 -6 112 112" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label={label || `${signal?.name || 'Referee'} signal`} data-playing={active && hasMotion ? 'true' : 'false'} data-signal={signal?.id || 'none'}>
      <defs>
        <pattern id={`stripes-${unique}`} width="6" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="12" fill="#fff" /><rect width="2.5" height="12" fill="#172437" /></pattern>
      </defs>
      <ellipse cx="50" cy="100" rx="20" ry="1.8" fill="#dce6ef" />
      <path d="M45,64 L44,92 M55,64 L56,92" fill="none" stroke="#172437" strokeWidth="7" strokeLinecap="round" />
      <path d="M38,96 H48 M52,96 H62" fill="none" stroke="#71859c" strokeWidth="1.5" strokeLinecap="round" />
      <path d={leg ? 'M51,48 L69,48 L60,65 L40,65 Z' : 'M38,32 L62,32 L60,65 L40,65 Z'} fill={`url(#stripes-${unique})`} stroke="#172437" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x={leg ? 56.5 : 46.5} y={leg ? 40 : 24} width="7" height="8" fill="#efc8a8" />
      <circle cx={leg ? 60 : 50} cy={leg ? 34 : 18} r="8" fill="#efc8a8" stroke="#172437" strokeWidth="1.3" />
      <path d={leg ? 'M52.5,33 Q60,19 67.5,33' : 'M42.5,17 Q50,3 57.5,17'} fill="none" stroke="#172437" strokeWidth="2.7" />
      {signal?.target && <circle cx={signal.target[0]} cy={signal.target[1]} r="7" fill="none" stroke="#dc8241" strokeWidth="1" strokeDasharray="2 2" />}
      {['left', 'right'].map((side, i) => {
        const shoulder = shoulders[i]
        const points = f => `${shoulder.join(',')} ${f[side][0]},${f[side][1]} ${f[side][2]},${f[side][3]}`
        const hand = f => `${f[side][2]} ${f[side][3]}`
        return <g key={side}>
          <polyline points={points(first)} fill="none" stroke="#172437" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            {hasMotion && <Motion frames={frames} attributeName="points" value={points} />}
          </polyline>
          <circle cx={shoulder[0]} cy={shoulder[1]} r="1.3" fill="#fff" />
          <g transform={`translate(${hand(first)})`}>
            {hasMotion && <Motion frames={frames} value={hand} transform />}
            <Hand kind={signal?.hands[i] || 'palm'} />
          </g>
        </g>
      })}
      {signal?.fingers && <g fill="#b55b28" fontSize="6" fontWeight="700" textAnchor="middle"><text x="28" y="25">5</text><text x="73" y="25">+1</text></g>}
    </svg>
  )
}
