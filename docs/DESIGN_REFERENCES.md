# Design references and visual direction

Checked on **2026-11-03** by fetching each page with the WebFetch tool, which returns a text/markdown rendering of the
page, not a visual one. Where a page was an image grid or a JavaScript app, the text was thin and the table says so.
Nothing here was copied; no third-party layout, text or code is used.

## Reference matrix

| Reference | URL fetched | What was actually observed | How it was used | Licence / a11y / performance notes |
| --- | --- | --- | --- | --- |
| Godly | `https://godly.website/` | Returned a `301` to `recent.design` (Godly now redirects there). | Followed the redirect. | n/a |
| Recent | `http://recent.design/?ref=godly` | A design-inspiration feed: category filters (Web, Interface, Branding, Motion, ...) and a thumbnail grid. The extracted text had **no** typography, colour or description data, only titles. | Confirmed that the "Interface" and "Motion" categories exist. No specific design was taken from it. | Image-only content: could not judge quality or accessibility from text. |
| 21st.dev | `https://21st.dev/` | A registry of community React + Tailwind + shadcn/ui components. Components are copied into the repo through the shadcn CLI. The page states no licence and says nothing about accessibility. | **Not used.** This app is Phaser + React with hand-written CSS and no Tailwind. | No licence text, unknown a11y: would need an audit per component before reuse. |
| Realtime Colors | `https://www.realtimecolors.com/` | A palette/font previewer with 5 colour roles (text, background, primary, secondary, accent), a three-state AA/AAA contrast indicator, font pairing and CSS export. The page is a JS app, so the static text showed unrendered placeholders. | Borrowed the *method* only: five colour roles and an AA/AAA check. The check is implemented independently (`src/util/contrast.ts`) and asserted in `test/state-format-tokens.test.ts` for all three schemes. | Their output was not used. |
| Fontshare | `https://www.fontshare.com/` and `https://api.fontshare.com/v2/css?...` | The page text was only a tagline ("Quality Fonts. Free."). The CSS API did return `@font-face` rules with woff2 URLs. **The licence text could not be retrieved** (the licence page is a JS app). | **Not used**, because I could not verify the licence terms for committing/self-hosting the files. | Unverified licence. |
| Fontsource (substitute) | npm `@fontsource-variable/*` | Packages ship the OFL-licensed Google Fonts as self-hostable variable woff2 with the licence text inside the package. | **Used**: Bricolage Grotesque (display) and Instrument Sans (body). Latin subsets load first; `font-display: swap`. | SIL OFL 1.1. Variable fonts, ~40 kB + ~30 kB for the Latin subsets. |
| Motion | `https://motion.dev/` | Describes layout animations, gestures, springs, "3.2 kB" mini animate. **Does not mention reduced-motion support** on the page; licence given only as "free and open source". | **Not used.** Motion here is CSS transitions plus Phaser tweens, all gated by one reduced-motion switch (OS setting or in-app Motion setting). | No extra bundle; reduced-motion handling is under our control. |

Not evaluated (no relevance to a game client, or could not be tied to a verified URL): React Spring, Lenis, Modulify,
Motionin, Landdding, 60fps, Footer, Thinking Orbs, Paper Shaders, Manus, Archify, OmniRoute, Figma, the retail examples.
Lenis was specifically skipped: the arena is a fixed-viewport canvas with no scrolling content, so smooth scrolling has
nothing to improve.

## Personas and jobs

1. **Quick-match player on a laptop** (16-35): wants to be in a round within two clicks, with a fair result.
2. **Phone player on a commute**: one hand, swipes, unreliable network; needs big targets and a graceful reconnect.
3. **Friends in a private room**: share a five-letter code, wait for everyone to be ready, play, see an unarguable score.
4. **Player with colour-vision difference or motion sensitivity**: must tell snakes apart without hue, and must be able
   to remove screen shake and bobbing.

## Two directions compared

| | A. "Parchment board" (chosen) | B. "Night signal" (rejected) |
| --- | --- | --- |
| Idea | A tabletop board game: cream board, ink outlines, glazed ribbons with printed patterns. Dark ink UI chrome, warm amber accent. | Dark navy canvas with glowing neon snakes. |
| Fit | Patterns + outlines give colour-independent identity and strong contrast on any board; calm for long sessions. | Neon on dark is the default look of snake games and AI templates; glow hides outlines and hurts glare/contrast. |
| Risk | Light arena can be bright in a dark room, so two dark arena themes (Kiln, Tidepool) are offered. | Low-contrast bloom, fatigue, easy to look generic. |

## Visual system (as built)

* **Type**: Bricolage Grotesque 800 for display, Instrument Sans for text. Fluid scale `clamp()` from 1.75 to 5 rem for
  headings; HUD numerals are tabular.
* **Colour roles**: `bg`, `surface`, `surface-raised`, `hairline`, `border`, `text`, `text-dim`, `accent`, `danger`,
  `success`, `focus`. Dark, light and system-light token sets; every text/control pair is asserted >= WCAG AA.
* **Arena themes**: Parchment, Kiln, Tidepool. Snake outlines are ink on light boards and cream on dark boards; the
  outline-to-board ratio is asserted >= 3:1 for every theme.
* **Snake identity**: eight fill colours *and* eight patterns (solid, stripes, dots, chevrons, checks, rings, diamonds,
  hatch). The scoreboard swatch draws the same pattern.
* **Motion**: sliding between cells at constant speed, small hit feedback. With reduced motion: no screen shake, no
  idle bobbing, no scatter or travelling particles, only short fades in place.
* **Touch**: swipe anywhere on the arena or the steering pad (64 x 56 px keys, below the arena). The arena turns a
  quarter turn on tall screens so cells stay big.
