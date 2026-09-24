# Draws public/stage.svg, the home page's picture: a keyboard on stage with a
# tablet on its music rest showing a chart. A placeholder for a real photo.
# Run: python3 apps/site/scripts/stage.py
import math, os, random

W, H = 1200, 800
random.seed(7)
out = []
a = out.append

a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="A keyboard on stage, with a tablet on its music rest showing a chord chart">')
a('''<defs>
  <radialGradient id="spot" cx="30%" cy="-10%" r="85%"><stop offset="0" stop-color="#f6c177" stop-opacity=".55"/><stop offset=".45" stop-color="#b4637a" stop-opacity=".12"/><stop offset="1" stop-color="#0b0b0f" stop-opacity="0"/></radialGradient>
  <radialGradient id="cool" cx="88%" cy="15%" r="60%"><stop offset="0" stop-color="#6d7fd8" stop-opacity=".35"/><stop offset="1" stop-color="#0b0b0f" stop-opacity="0"/></radialGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3b8" stop-opacity=".22"/><stop offset="1" stop-color="#fbe3b8" stop-opacity="0"/></linearGradient>
  <linearGradient id="beam2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb0ff" stop-opacity=".16"/><stop offset="1" stop-color="#9fb0ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d6cf"/><stop offset="1" stop-color="#f4f1ea"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1b21"/><stop offset="1" stop-color="#0d0d11"/></linearGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16161c"/><stop offset="1" stop-color="#101015"/></linearGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#cfd6ff" stop-opacity=".22"/><stop offset="1" stop-color="#cfd6ff" stop-opacity="0"/></radialGradient>
  <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".6"/></filter>
</defs>''')
a(f'<rect width="{W}" height="{H}" fill="#0b0b0f"/>')
a(f'<rect width="{W}" height="{H}" fill="url(#spot)"/><rect width="{W}" height="{H}" fill="url(#cool)"/>')
# Light beams from the rig.
a('<polygon points="300,0 380,0 620,800 60,800" fill="url(#beam)"/>')
a('<polygon points="930,0 980,0 1180,700 760,700" fill="url(#beam2)"/>')
# Out-of-focus stage lights.
for _ in range(26):
    x, y, r = random.uniform(0, W), random.uniform(0, 330), random.uniform(6, 26)
    c = random.choice(["#f6c177", "#f2a36b", "#9fb0ff", "#e8d9c3"])
    a(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.0f}" fill="{c}" opacity="{random.uniform(.08, .3):.2f}" filter="url(#blur3)"/>')

# The keyboard, in perspective: its front edge low and wide, its back edge higher and narrower.
fy, fx0, fx1 = 760, -40, 1240      # front of the keys
by, bx0, bx1 = 600, 150, 1050      # back of the keys
lerp = lambda p, q, t: p + (q - p) * t
# Body behind and under the keys.
a(f'<polygon points="{bx0-40},{by-46} {bx1+40},{by-46} {fx1+60},{fy+40} {fx0-60},{fy+40}" fill="url(#body)"/>')
a(f'<polygon points="{bx0-40},{by-46} {bx1+40},{by-46} {bx1+30},{by-8} {bx0-30},{by-8}" fill="#24232b"/>')
# Little lit controls on the panel.
for i in range(9):
    t = .08 + i * .025
    x = lerp(bx0 - 30, bx1 + 30, t)
    a(f'<circle cx="{x:.0f}" cy="{by-27}" r="3" fill="{"#f6c177" if i in (1, 4) else "#3a3944"}"/>')
for i in range(5):
    x = lerp(bx0, bx1, .72 + i * .045)
    a(f'<rect x="{x:.0f}" y="{by-34}" width="22" height="14" rx="3" fill="#2f2e38"/>')
N = 29  # white keys
def at(t, depth):  # a point t (0..1) across the keys, depth 0 = back, 1 = front
    y = lerp(by, fy, depth)
    x0, x1 = lerp(bx0, fx0, depth), lerp(bx1, fx1, depth)
    return lerp(x0, x1, t), y
for i in range(N):
    t0, t1 = i / N, (i + 1) / N
    pts = [at(t0 + .002, 0), at(t1 - .002, 0), at(t1 - .002, 1), at(t0 + .002, 1)]
    a('<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + '" fill="url(#white)" stroke="#9c988f" stroke-width=".6"/>')
pattern = [1, 1, 0, 1, 1, 1, 0]  # a black key after C, D, (not E), F, G, A, (not B)
for i in range(N - 1):
    if not pattern[i % 7]:
        continue
    t = (i + 1) / N
    w = .3 / N
    pts = [at(t - w, 0), at(t + w, 0), at(t + w, .58), at(t - w, .58)]
    a('<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + '" fill="#121117"/>')
    top = [at(t - w * .78, .02), at(t + w * .78, .02), at(t + w * .7, .5), at(t - w * .7, .5)]
    a('<polygon points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in top) + '" fill="#2a2932"/>')
# The tablet's glow on the keys.
a('<ellipse cx="600" cy="640" rx="330" ry="70" fill="url(#glow)"/>')

# The tablet, on the music rest.
tx, ty, tw, th = 430, 240, 340, 250
# The music rest: a ledge under the tablet, on two arms down to the keyboard's panel.
for x in (tx + 40, tx + tw - 40):
    a(f'<polygon points="{x-5},{ty+th+10} {x+5},{ty+th+10} {x+9},{by-44} {x-9},{by-44}" fill="#17161c"/>')
a(f'<rect x="{tx-40}" y="{ty+th+2}" width="{tw+80}" height="16" rx="5" fill="#1d1c23" stroke="#2c2b33"/>')
a(f'<rect x="{tx-40}" y="{ty+th+2}" width="{tw+80}" height="4" rx="2" fill="#34333c"/>')
a(f'<g transform="rotate(-2 {tx+tw/2} {ty+th/2})" filter="url(#shadow)">')
a(f'<rect x="{tx-12}" y="{ty-12}" width="{tw+24}" height="{th+24}" rx="18" fill="#050507" stroke="#2c2b33" stroke-width="1.5"/>')
a(f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="6" fill="url(#screen)"/>')
sans = 'font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif"'
a(f'<text x="{tx+22}" y="{ty+34}" {sans} font-size="17" font-weight="600" fill="#f4f1ea">Evening Light</text>')
a(f'<text x="{tx+22}" y="{ty+52}" {sans} font-size="10" fill="#8a8894">Key of A · Capo 2 · 76 BPM</text>')
a(f'<text x="{tx+tw-22}" y="{ty+34}" {sans} font-size="10" fill="#8a8894" text-anchor="end">2 / 5</text>')
a(f'<text x="{tx+22}" y="{ty+80}" {sans} font-size="9" font-weight="600" letter-spacing="1.2" fill="#8a8894">VERSE 1</text>')
mono = 'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"'
lines = [
    ([(0, "A"), (14, "E/G#"), (28, "F#m")], "Hold the light a little longer"),
    ([(4, "D"), (20, "A"), (31, "E")], "till the city falls asleep"),
    ([(0, "A"), (15, "E/G#"), (27, "F#m")], "Every word we never said out"),
    ([(6, "D"), (18, "E"), (29, "A")], "loud is ours to keep"),
]
cw = 6.6  # character width at font-size 11
y = ty + 100
for chords, words in lines:
    for col, name in chords:
        a(f'<text x="{tx+22+col*cw:.1f}" y="{y}" {mono} font-size="11" font-weight="700" fill="#f6c177">{name}</text>')
    a(f'<text x="{tx+22}" y="{y+15}" {mono} font-size="11" fill="#d6d3cc">{words}</text>')
    y += 36
a(f'<rect x="{tx+tw-120}" y="{ty+th-34}" width="98" height="20" rx="10" fill="#23222a"/>')
a(f'<text x="{tx+tw-71}" y="{ty+th-20}" {sans} font-size="9" fill="#c9c6bf" text-anchor="middle">Next: Chorus ›</text>')
a('</g>')
# A little haze over everything.
a(f'<rect width="{W}" height="{H}" fill="url(#spot)" opacity=".25"/>')
a('</svg>')

path = os.path.join(os.path.dirname(__file__), "..", "public", "stage.svg")
open(path, "w").write("\n".join(out))
print("wrote", os.path.normpath(path))
