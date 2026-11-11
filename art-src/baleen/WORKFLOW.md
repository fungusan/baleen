# Baleen character art — standard workflow

This replaces ad-hoc prompting. It follows the method observed in ZipZipPipe's public work: one
canonical full-body master per character, every variant derived from that single base, transparent
master renders, and candidates generated as a batch and curated. He publishes no prompts, seeds or
retouch steps; the process below is a reconstruction from his Pixiv notes, the shipped files, and
our own measured rolls.

Credit and license are not optional — see [Attribution](#attribution).

## Rules

1. **Master first.** One canonical full-body master per drawing (the maid and the Flash drawing) is
   approved before any variant exists. Never derive a master from a variant, and never chain
   variant → variant.
2. **One full body per request.** A reference set holds exactly one complete figure. Extra complete
   figures compete for pose and composition; add crops and material swatches instead.
3. **Batch, then curate.** `--quantity 3` or `4` in one POST, all from the same base. Pick one.
   Keep every output and its `.json`. Do not serially retry the same attribute.
4. **Transparent master.** Ask the model for transparency (`--transparency`) or a flat `#00FF00`
   plate, then key locally. Never bake a scene background in.
5. **Pin the model in every quote.** The wrapper defaults to `gemini-image-2` ($0.2093); omitting
   `--model` has billed 3.6× the quoted NB2 price. Quote exact model + size + quantity + cap, and
   get approval per batch.
6. **Post-fix before re-roll.** Colour, per-leg opacity and leg width are deterministic grades.
   Paying again for them drifts pose, props and palette.

## Stages

### 0. Brief

Write the brief to `art-src/baleen/prompts/<name>.txt` before generating. Name every garment,
every colour (hex where it matters), the pose, the framing, and an explicit KEEP list. Put the
proportion numbers in as fractions of figure height. Keep under 7,500 chars (local check, never
billable).

### 1. References

Use the drawing's own master as the identity/proportion base — `art-src/baleen/raw/master-idle-v2.png`
for the maid, `art-src/baleen/raw/flash-master.png` for Flash. Add at most:

- one head crop for hair/face attributes,
- one material swatch for stockings/fabric,
- one silhouette only when no rendered pose exists (it must be the sole complete figure).

Strength on models that support it: full-body `HIGH`, attribute crops `HIGH`, material swatches
`MID`. GPT and FLUX expose no per-reference strength — pass `--plain-refs`.

### 2. Master or candidate roll

```sh
# Design probe: cheapest, good numbers, stockings come out opaque.
node scripts/leonardo.mjs gemini \
  --refs art-src/baleen/raw/master-idle-v2.png=HIGH \
  --model nano-banana-2 --width 1536 --height 2752 --seed 20261107 \
  --prompt-file art-src/baleen/prompts/<name>.txt \
  --out art-src/baleen/raw/<name>-v1.jpg

# Outfit/pose fidelity with transparency, four candidates in one billable POST.
node scripts/leonardo.mjs gemini \
  --refs art-src/baleen/raw/master-idle-v2.png=HIGH \
  --model openai/gpt-image-2.5-flare --width 1344 --height 2016 \
  --transparency --quantity 4 --plain-refs \
  --prompt-file art-src/baleen/prompts/<name>.txt \
  --out art-src/baleen/raw/<name>-v1.png
```

Outputs are `<name>-v1.png`, `<name>-v1-2.png`, … and one `<name>-v1.json` recording the model,
size, per-image cost, quantity, transparency, all URLs, seed and reference ids. Never delete or
overwrite a `.json`; never overwrite a render — increment the version.

If a model rejects `--transparency`, drop the flag and render on flat `#00FF00` instead; keying is
free.

### 3. QA

```sh
/usr/local/bin/python3 scripts/art_qa.py \
  --render art-src/baleen/raw/<candidate>.png \
  --master art-src/baleen/raw/master-idle-v2.png --strict
```

Reference run against the master itself: aspect `0.5518`, head detail gradient `15.34`, local std
`28.63`. The rejected Sunburst school render scored head detail `×0.74` — the numeric face of
"flat cyan ribbons instead of painted hair".

| Gate | Limit | Notes |
| --- | --- | --- |
| Frame | ≥ 2 px clear background per side | unless the master is a tight cut-out |
| Figure aspect | within ±0.03 of master | a swept tail or wide skirt moves this |
| Head-band detail | ≥ 0.85× master gradient | the first thing high-quality art loses |
| Band Lab dE | ≤ 8 per 20% body band, `--bands` | same-outfit re-renders only; an outfit change is supposed to move it |
| Tail | one, attached at the hip, fluke clear of the legs | check at 100% |
| Limbs | two legs/shoes, five fingers per hand, no fused hand | check at 100% |
| Stockings | both legs equal within 2 L, no rim highlight | measured per leg, not eyeballed |

Proportions are not inferred from the silhouette — a tail reads as a second leg. Measure the
outfit's own landmarks with a colour probe (waistband and hem-line rows), as a fraction of figure
height. Maid targets: chin 21%, shoulders 25%, waist 44%, skirt hem 67%, knee 79%, ankle 94%,
figure aspect 0.552. A render that puts the waistband near 38% and the hem near 52% is leggy no
matter how good the face is.

### 4. Curate

Show candidates side by side at 100% (face, hands, tail, hem, feet). Pick one; record why the
others failed in the batch note. A rejected render is not a base.

### 5. Post-fix

| Symptom | Fix | Re-roll? |
| --- | --- | --- |
| Hair too dark / too blue | `scripts/hair_grade.py`, target hair mid `#6475A6` | no |
| Unequal stocking opacity | per-leg median match, then cool b | no |
| Legs too wide | per-row leg-run slim (0.93) | no |
| Flat detail, missing strands | new model or added head-crop ref | yes |
| Wrong tail attachment, fused hand, wrong leg count | new base render | yes |
| Wrong waist/hem proportions | re-render with the numbers re-pinned | yes |

After any grade, re-run `art_qa.py` for the same-outfit gate and confirm the intended band moved.

### 6. Export and ship

Six supplied masters ship. A model's first drawing is its default, and a model with more than one
offers the rest under **Appearance › Outfit**:

| Art id | Shown for | Source | Export |
| --- | --- | --- | --- |
| `baleen` | DeepSeek V4 Pro (Maid) | `raw/master-idle-v2.png` (maid cut-out) | 575x1040, aspect 0.553 |
| `baleen-pro-witch` | DeepSeek V4 Pro (Witch) | `raw/pro-witch-master.png` (supplied transparent moon-staff gown) | 577x1040, aspect 0.5548 |
| `baleen-flash` | DeepSeek Flash (Maid) | `raw/flash-master.png` (notebook drawing) | 543x1040, aspect 0.522 |
| `baleen-flash-witch` | DeepSeek Flash (Witch) | `raw/flash-witch-master.png` (supplied transparent broom render) | 576x1040, aspect 0.5538 |
| `baleen-kimi` | Kimi K3.1 Pro (Moonlit) | `raw/kimi-moonlit-nobg.png` (Leonardo `remove-bg` of `kimi-moonlit-master.png`) | 556x1040, aspect 0.5346 |
| `baleen-kimi-halloween` | Kimi K3.1 Pro (Pumpkin) | `raw/kimi-halloween-nobg.png` (Leonardo `remove-bg` of the flattened cat master) | 559x1040, aspect 0.5375 |
| `baleen-qwen` | Qwen3.8 Max (Fan) | `raw/qwen-master.png` (supplied white-page drawing) | 540x1040, aspect 0.5192 |
| `baleen-glm` | GLM-5.3 (Cat) | `raw/glm-nobg.png` (Leonardo `remove-bg` of `glm-master.png`) | 562x1040, aspect 0.5404 |
| `baleen-glm-ghost` | GLM-5.3 (Ghost) | `raw/glm-ghost-master.png` (supplied transparent cut-out) | 582x1040, aspect 0.5596 |
| `baleen-minimax` | MiniMax M3 (Reporter) | `raw/minimax-master.png` (supplied white-page drawing) | 558x1040, aspect 0.5365 |

```sh
# Leonardo's remover (remove.bg's engine): sync, one fixed price, ephemeral result.
node scripts/leonardo.mjs removebg art-src/baleen/raw/<page-master> \
  --out art-src/baleen/raw/<name>-nobg.png
```

`removebg` posts to `/v2/generationssync` with model `remove-bg` and **bills $0.1047 per image**.
The response is wrapped in `generateSync` and returns a temporary S3 URL (not `dataB64` unless
asked), so the PNG must be saved in the same run — the ephemeral job cannot be fetched by id
afterwards. A transparent master must be flattened onto white first (Pillow: paste the RGBA over
white using its alpha) or the remover sees transparent black. The output keeps the master's
resolution and has a clean, decontaminated matte: on the moonlit dress it removed the pale
white-page rim that the local keyer left along dark silhouettes (edge offset +61 → −4 levels),
and on the cat it tightened a very soft supplied alpha (partial pixels 21.8k → 7.7k). The GLM cat's
white page also carried a dithered ground shadow that the local white keyer kept as an opaque oval;
`remove-bg` dropped it (2026-11-10, $0.1047).

Export the cut-out by trimming at alpha > 2 and resizing premultiplied (`convert("RGBa")`) to
height 1040; do not run it through `key_art.py --bg alpha`, whose flat-white band pass targets
white-composited cut-outs.

The witch masters arrived already transparent, bats included, so they skipped matting and were
trimmed and resized directly: the broom for Flash and the moon-staff gown for V4 Pro (the gown's
matte is soft but clean — low-alpha pixels keep the figure's own dark purple, not a white rim). The
earlier wisteria-swing drawing (`swing-master.png` and its Leonardo `remove-bg` cut-out) is kept
beside them as a supplied source but is not exported or shipped.

```sh
# Local keyer for the two DeepSeek masters:
/usr/local/bin/python3 scripts/key_art.py <approved> <out>.webp \
  --bg alpha --fit-h 1040 --max-w 800 --max-h 1200

# White-page master with a soft ground shadow (still available for page masters):
/usr/local/bin/python3 scripts/key_art.py art-src/baleen/raw/kimi-moonlit-master.png <out>.webp \
  --bg white --floor-shadow --fit-h 1040 --max-w 800 --max-h 1200
```

Use `--bg alpha` for a render that already carries transparency (the maid cut-out and the pumpkin
cat) and `--bg white` for a drawing on a page (the notebook, the moonlit flute). The white keyer
measures the page tone and only accepts near-untinted pixels within four levels of it: on a
white-haired drawing a looser threshold lets the flood tunnel through pale strands and punch holes
in the hair. It also protects large neutral enclosed whites (the notebook page, the pale dress
panels) from the border flood, so paper and shaded fabric stay opaque. Pass `--floor-shadow` only
when the master has a soft ground shadow: it keys the neutral, dithered gradient by texture and
connectivity (including the part cropped by the bottom edge), removes isolated bright flecks, and
leaves navy boots and white clothing untouched.

`key_art.py` composites the figure onto an 800x1200 transparent canvas, so the raw WebP is *not*
the shipped aspect. Trim at alpha > 2 and re-save before recording the size; otherwise the overlay
box includes empty padding and the bubble inset is wrong.

Bump `ART_REVISION` in `src/shared/characters.ts`, `npm run build`, then verify in Chrome for
Testing: `img.src` carries `?v=<version>-<revision>`, `naturalWidth` is the exported size, the drawn
box aspect matches, and changing the model swaps the drawing. A file swap without the revision bump
serves the cached image.

### 7. Provenance

Keep the brief, the render, the `.json` and the QA output together under
`art-src/baleen/{prompts,raw}/`. A render without its `.json` is not reproducible and should not
ship.

## Models (measured on this account, 2026-11)

| Model | Size | Price | Use | Known limits |
| --- | --- | --- | --- | --- |
| `nano-banana-2` | 1536x2752 | $0.0583 | design probes, cheap batches | opaque stockings, tail defects, less detail |
| `gemini-image-2` | 1696x2528 | $0.2093 | best text-only sheer stockings | proportions not guaranteed |
| `openai/gpt-image-2.5-flare` | 1344x2016 | $0.1988 | outfit fidelity, pose change | ignores numeric proportions, glossy stocking film, tail can detach |
| `openai/gpt-image-2.5-sunburst` | 1344x2016 | $0.1988 | same as flare | head detail ×0.74 vs master on the last test |
| `bfl/flux-3-image` | 1680x2512 | $0.1465 | strand-level hair | needs `--plain-refs`, limited sizes |
| `remove-bg` | source size | $0.1047 | production matte for supplied page masters | sync + ephemeral; save the result immediately |

Prices are per image, from this account's records; check the live catalog before quoting. A raw GPT
call defaults to `quantity: 4`; the wrapper always sends `quantity: 1` unless `--quantity` is given,
so a naive request can no longer bill four images.

What text reliably controls: outfit description, pose when only one full body is in the set,
expression, small props. What it does not: structural placement (tail root), proportions and limb
width, sheer nylon physics, fine strand detail. Use a reference crop or a post-grade for those.

## Attribution

The character is derivative fan art:

- DeepSeek 娘化 ("AI娘化") by **ZipZipPipe** — <https://www.pixiv.net/en/artworks/148186519>.
  Terms stated by the artist: credit the author, no commercial use.
- The moonlit flute and pumpkin cat Kimi costumes and both witch drawings are also ZipZipPipe
  renders. Kimi is a Moonshot AI character: non-commercial fan art only, with no affiliation or
  endorsement implied.
- The Fan (Qwen), Cat and Ghost (GLM), and Reporter (MiniMax) drawings were supplied for this build
  and are ZipZipPipe drawings too. Treat them as non-commercial fan art of those providers' brands,
  with no affiliation or endorsement implied.
- The unused wisteria-swing source (`raw/swing-master.png`) is by **阮米糕**, who publishes on Pixiv
  and X under that name. The artist's terms: credit the source when reposting, no commercial use
  (转载请标明出处，禁止商用). It is kept as source only and no build ships it.
- Original whale-girl OC 溟月 by **上善** — <https://www.pixiv.net/en/users/62155430>, reused under
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Every derived render inherits those terms: non-commercial, share-alike, credit preserved. The
credit is shown in the popup footer and documented in `README.md` and `LICENSE`. Do not remove it,
and do not distribute a build including this art commercially.
