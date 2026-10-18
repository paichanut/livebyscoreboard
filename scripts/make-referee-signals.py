# One-page A4 referee-signal cheat sheet (IIHF 2026/27, Appendix I), drawn from scratch as pictograms.
# Lookalike signals share a card. Output: public/referee-signals.html (+ PDF via scripts/print-referee-signals.mjs).
import html, pathlib

INK = '#111'
SKIN = '#f3d2b3'
RED = '#e63946'
HEAD = (50, 17)
SH_L, SH_R = (39, 31), (61, 31)   # shoulders (viewer's left / right)

def pt(p): return f'{p[0]},{p[1]}'

def arm(pts, hand='fist', ang=0):
    # upper arm + forearm (sleeve), then the hand: fist / palm (open hand) / point / none
    d = 'M' + ' L'.join(pt(p) for p in pts)
    out = f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>'
    x, y = pts[-1]
    if hand == 'fist':
        out += f'<circle cx="{x}" cy="{y}" r="3.6" fill="{SKIN}" stroke="{INK}" stroke-width="1.4"/>'
    elif hand == 'palm':
        out += f'<rect x="{x-3}" y="{y-4.5}" width="6" height="9" rx="2.6" fill="{SKIN}" stroke="{INK}" stroke-width="1.4" transform="rotate({ang} {x} {y})"/>'
    elif hand == 'point':
        out += f'<rect x="{x-2}" y="{y-6}" width="4" height="10" rx="2" fill="{SKIN}" stroke="{INK}" stroke-width="1.4" transform="rotate({ang} {x} {y})"/>'
    return out

def arrow(d, dashed=False):
    dash = ' stroke-dasharray="3 2"' if dashed else ''
    return f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="1.8" stroke-linecap="round" marker-end="url(#ah)"{dash}/>'

def mark(x, y, label):
    return (f'<circle cx="{x}" cy="{y}" r="5" fill="{RED}"/>'
            f'<text x="{x}" y="{y+2.2}" font-size="6.5" font-weight="800" fill="#fff" text-anchor="middle">{label}</text>')

def figure(arms_svg, extra='', legs=True):
    body = (
        f'<path d="M{SH_L[0]-1},{SH_L[1]-1} L{SH_R[0]+1},{SH_R[1]-1} L59,63 L41,63 Z" fill="url(#stripes)" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>'
        f'<rect x="46.5" y="23" width="7" height="6" fill="{SKIN}" stroke="{INK}" stroke-width="1.2"/>'
        f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="7.5" fill="{SKIN}" stroke="{INK}" stroke-width="1.6"/>'
        f'<path d="M42.6,15 Q50,6 57.4,15" fill="none" stroke="{INK}" stroke-width="2.4"/>'  # helmet line
    )
    leg = (f'<path d="M45,62 L44,92 M55,62 L56,92" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
           f'<path d="M39,95 L48,95 M52,95 L61,95" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>') if legs else ''
    return leg + body + arms_svg + extra

def svg(content, full=False):
    # arm signals only need the upper body: crop so the gesture is drawn bigger
    box = '12 4 76 96' if full else '4 -4 92 72'
    return (f'<svg viewBox="{box}" xmlns="http://www.w3.org/2000/svg">'
            f'<defs><pattern id="stripes" width="5" height="10" patternUnits="userSpaceOnUse">'
            f'<rect width="5" height="10" fill="#fff"/><rect width="2.5" height="10" fill="{INK}"/></pattern>'
            f'<marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{RED}"/></marker></defs>{content}</svg>')

DOWN_L = arm([SH_L, (36, 47), (38, 62)], 'palm')
DOWN_R = arm([SH_R, (64, 47), (62, 62)], 'palm')

# name (EN), rule, Thai name, Thai description of the gesture, pictogram, tell-apart note (optional)
SIGNALS = [
  ('Boarding', '41', '', 'Clenched fist strikes the open palm of the other hand, in front of the chest.',
   figure(arm([SH_R, (66, 46), (54, 43)], 'palm', 0) + arm([SH_L, (34, 44), (46, 41)], 'fist') + arrow('M41,34 L44.5,38.5')), None),
  ('Charging', '42', '', 'Clenched fists rotate around each other in front of the chest.',
   figure(arm([SH_L, (35, 47), (46, 43)], 'fist') + arm([SH_R, (65, 47), (54, 43)], 'fist') + arrow('M42,51 A9,7 0 1 1 58,52')), None),
  ('Checking from behind', '43', '', 'Both arms push forward from the chest, palms open and facing away, at shoulder level.',
   figure(arm([SH_L, (37, 36), (41, 33)], 'palm') + arm([SH_R, (63, 36), (59, 33)], 'palm') + arrow('M34,26 L26,20') + arrow('M66,26 L74,20')), 'Open palms. Cross-checking uses fists.'),
  ('Cross-checking', '59', '', 'Both fists clenched, pushed forward and back from the chest about 30 cm.',
   figure(arm([SH_L, (36, 46), (45, 40)], 'fist') + arm([SH_R, (64, 46), (55, 40)], 'fist') + arrow('M50,36 L50,28') + arrow('M50,28 L50,36')), 'Fists. Checking from behind uses open palms.'),
  ('Tripping · Kneeing · Clipping', '57 · 50 · 44', '', 'Hand strikes the leg, skates on the ice. ① Below the knee = Tripping ② Knee = Kneeing ③ Behind the knee = Clipping.',
   figure(arm([SH_R, (66, 48), (59, 72)], 'palm', 20) + arm([SH_L, (35, 47), (38, 61)], 'palm') + mark(36, 84, '1') + mark(50, 74, '2') + mark(64, 80, '3')), None),
  ('Elbowing', '45', '', 'Tapping either elbow with the opposite hand.',
   figure(arm([SH_R, (73, 41), (60, 46)], 'fist') + arm([SH_L, (38, 47), (71, 41)], 'palm', 90)), None),
  ('Check to head or neck', '48', '', 'Open palm of the non-whistle hand pats the side of the head.',
   figure(arm([SH_R, (71, 25), (59, 15)], 'palm', -10) + DOWN_L), None),
  ('Roughing · Fighting', '51', '', 'Clenched fist, arm extended straight out to the side.',
   figure(arm([SH_R, (75, 31), (89, 31)], 'fist') + DOWN_L), 'Fist. Offside called is an open hand.'),
  ('Holding · Holding the stick', '54', '', 'Clasp one wrist in front of the chest. Holding the stick: then both hands as if on a stick.',
   figure(arm([SH_R, (65, 47), (53, 44)], 'fist') + arm([SH_L, (35, 48), (51, 46)], 'palm', 90)), None),
  ('Hooking ↔ Spearing', '55 · 62', '', 'Both arms tug toward the stomach = Hooking. Jab out, then drop the hands = Spearing.',
   figure(arm([SH_L, (37, 48), (45, 46)], 'fist') + arm([SH_R, (63, 48), (55, 46)], 'fist') + arrow('M40,56 L46,52') + arrow('M60,56 L54,52')), None),
  ('Interference · Icing called', '56 · 81', '', 'Arms crossed, still, in an X in front of the chest. Referee = Interference · linesperson after the whistle = Icing.',
   figure(arm([SH_L, (39, 49), (61, 38)], 'fist') + arm([SH_R, (61, 49), (39, 38)], 'fist')), None),
  ('Butt-ending', '58', '', 'Closed-fist forearm moves under the other forearm, held palm down.',
   figure(arm([SH_R, (67, 44), (45, 40)], 'palm', 90) + arm([SH_L, (36, 50), (55, 48)], 'fist') + arrow('M40,53 L57,53')), None),
  ('High-sticking', '60 · 80', '', 'Both fists clenched, one above the other at forehead height, as if holding a stick. Same signal for high-sticking the puck.',
   figure(arm([SH_R, (71, 22), (66, 9)], 'fist') + arm([SH_L, (45, 34), (66, 17)], 'fist')), None),
  ('Slashing', '61', '', 'Chopping motion with the edge of one hand across the opposite forearm.',
   figure(arm([SH_L, (35, 46), (60, 42)], 'fist') + arm([SH_R, (70, 35), (54, 33)], 'palm', 90) + arrow('M54,27 L54,36.5')), None),
  ('Delay of game', '63', '', 'Flat hand slides up from the other (lower) hand at the centre of the body.',
   figure(arm([SH_L, (37, 50), (50, 48)], 'palm', 90) + arm([SH_R, (64, 44), (52, 38)], 'palm', 90) + arrow('M58,49 L58,36')), None),
  ('Unsportsmanlike · Diving', '75 · 64', '', 'Both hands on hips, plus two fingers as appropriate.',
   figure(arm([SH_L, (29, 47), (40, 59)], 'fist') + arm([SH_R, (71, 47), (60, 59)], 'fist')), None),
  ('Too many players', '74', '', 'Six fingers (one open hand + one finger) in front of the chest.',
   figure(arm([SH_L, (33, 45), (40, 33)], 'palm') + arm([SH_R, (67, 45), (60, 33)], 'point')
          + '<text x="27" y="30" font-size="7" font-weight="800" fill="#e63946">5</text><text x="68" y="30" font-size="7" font-weight="800" fill="#e63946">+1</text>'), None),
  ('Penalty shot', '24', '', 'Both arms crossed over the head.',
   figure(arm([SH_L, (33, 16), (56, 3)], 'fist') + arm([SH_R, (67, 16), (44, 3)], 'fist')), None),
  ('Goal', '78', '', 'Outstretched hand points at the goal the puck legally entered.',
   figure(arm([SH_R, (75, 38), (89, 45)], 'point', -60) + DOWN_L + '<path d="M84,62 L84,52 L95,52 L95,62" fill="none" stroke="#e63946" stroke-width="1.8"/>'), None),
  ('Wash-out', '—', '', 'Sweep both arms out to the sides, palms down, at shoulder level: no goal, no offside, no icing, etc.',
   figure(arm([SH_L, (25, 31), (11, 31)], 'palm', 90) + arm([SH_R, (75, 31), (89, 31)], 'palm', 90) + arrow('M30,23 L14,23') + arrow('M70,23 L86,23')), None),
  ('Delayed offside · Possible icing', '83 · 81', '', 'Non-whistle arm straight up, flat hand. Lowered to the side = cancelled.',
   figure(arm([SH_R, (63, 16), (64, 2)], 'palm') + DOWN_L), None),
  ('Offside called', '83', '', 'Whistle, then arm extended horizontally, pointing at the blue line.',
   figure(arm([SH_R, (75, 31), (89, 31)], 'palm', 90) + DOWN_L + '<path d="M93,24 L93,38" stroke="#3a6fd8" stroke-width="3"/>'), 'Open hand. Roughing is a fist.'),
  ('Hand pass', '79', '', 'Open palm facing forward, pushed forward once or twice.',
   figure(arm([SH_R, (66, 44), (60, 37)], 'palm') + DOWN_L + arrow('M66,30 L74,24')), None),
  ('Time-out', '87', '', 'Both hands form a T in front of the chest.',
   figure(arm([SH_R, (61, 56), (52, 40)], 'none') + arm([SH_L, (33, 40), (42, 35)], 'none')
          + '<rect x="40" y="31.5" width="24" height="5" rx="2.5" fill="#f3d2b3" stroke="#111" stroke-width="1.4"/>'), None),
  ('Face-off violation warning', '76', '', 'One arm bent, open palm up, on the side of the team that committed the violation.',
   figure(arm([SH_R, (73, 43), (80, 32)], 'palm', 90) + DOWN_L), None),
]

def card(n, s):
    name, rule, th, desc, pic, note = s
    note_html = f'<div class="note">⚠ {html.escape(note)}</div>' if note else ''
    full = name.startswith('Tripping')
    return (f'<div class="card"><div class="pic">{svg(pic, full)}</div><div class="txt">'
            f'<div class="en">{html.escape(name)} <span class="rule">R{html.escape(rule)}</span></div>'
            f'<div class="desc">{html.escape(desc)}</div>{note_html}</div></div>')

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Referee signals – Live by Scoreboard</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
@page {{ size: A4; margin: 6mm 7mm; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ font-family: Barlow, sans-serif; color: #111; width: 196mm; }}
header {{ display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 1.5mm; margin-bottom: 2mm; }}
h1 {{ font-family: 'Barlow Condensed', sans-serif; font-size: 20pt; font-weight: 800; letter-spacing: .02em; }}
header .sub {{ font-size: 8pt; color: #444; text-align: right; }}
.grid {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.6mm; }}
.card {{ border: 1px solid #bbb; border-radius: 2.5mm; padding: 1.2mm; display: flex; flex-direction: column; break-inside: avoid; height: 51mm; }}
.pic {{ height: 27mm; display: flex; justify-content: center; }}
.pic svg {{ height: 100%; width: auto; overflow: hidden; }}
.txt {{ line-height: 1.15; }}
.en {{ font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 9.6pt; text-transform: uppercase; }}
.rule {{ font-weight: 700; color: #888; font-size: 7.5pt; }}
.th {{ font-weight: 700; font-size: 8.2pt; color: #b0121f; }}
.desc {{ font-size: 7.4pt; color: #222; margin-top: .4mm; }}
.note {{ font-size: 6.8pt; color: #9a5b00; margin-top: .5mm; font-weight: 600; }}
footer {{ margin-top: 1.6mm; font-size: 6.6pt; color: #555; display: flex; justify-content: space-between; gap: 4mm; }}
</style></head><body>
<header><h1>REFEREE SIGNALS</h1>
<div class="sub">IIHF Official Rule Book 2026/27 · Appendix I<br>Live by Scoreboard · contact Pai Chanut +66 81 635 1945</div></header>
<div class="grid">{''.join(card(i, s) for i, s in enumerate(SIGNALS))}</div>
<footer><span>Identical signals share a card · ⚠ lookalike signal, check the detail · red arrow = motion · R = IIHF rule number</span>
<span>Illustrations are a memory aid. Official reference: IIHF Rule Book, Appendix I</span></footer>
</body></html>'''

out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'referee-signals.html'
out.write_text(page, encoding='utf-8')
print('wrote', out, len(SIGNALS), 'cards')
