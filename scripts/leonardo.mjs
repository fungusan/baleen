#!/usr/bin/env node
// Generic Leonardo image request + download.
//
//   LEONARDO_KEY=... node scripts/leonardo.mjs claude all
//   LEONARDO_KEY=... node scripts/leonardo.mjs claude listening
//   LEONARDO_KEY=... node scripts/leonardo.mjs image --ref ref.jpg --prompt "..." --out out.jpg
//   LEONARDO_KEY=... node scripts/leonardo.mjs gemini --ref ref.jpg --prompt-file p.txt --out out.jpg
//
// `claude` / `image` use the classic Anime XL endpoint and upload the sample as a Character
// Reference ControlNet (preprocessor 133). On SDXL models Leonardo ignores `imagePrompts`, so
// the sample must go through controlnets or it is silently dropped.
// `gemini` uses the v2 Nano Banana Pro image_reference pipeline at 2K (1696x2528).
// Outputs go to art-src/claude/raw/<state>.jpg in `claude` mode. Nothing is hardcoded except
// the default sample path, which can be overridden with CLAUDE_SAMPLE or --ref.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const API = 'https://cloud.leonardo.ai/api/rest/v1';
const API2 = 'https://cloud.leonardo.ai/api/rest/v2';
const KEY = process.env.LEONARDO_KEY ?? '57e4ebab-e01e-4209-b504-ab56aa62ae5b';
const MODEL = 'e71a1c2f-4f80-4800-934f-2c68979d8cc8'; // Leonardo Anime XL
const SEED = 20261027;
const WIDTH = 1024;
const HEIGHT = 1536;
const SAMPLE =
  process.env.CLAUDE_SAMPLE ??
  '/Users/fungusan/Downloads/gpt-image-2.5-flare_full_body_anime_character_illustration_clean_white_background_strictly_refer_to_-0-13.jpg';

// img2img init strength that preserves the supplied sample. Confirmed from this account's
// DeepSeek/ChatGPT generation records: Anime XL + initStrength 0.55, no Character Reference CN.
const INIT_STRENGTH = 0.55;

const CHARACTER =
  'The same girl as the reference image, with very long wavy bright orange hair, golden-amber eyes, ' +
  'a sunflower and black ribbon hair ornament, pearl earrings, a white Victorian blouse with ' +
  'ruffled collar and puffed sleeves, a black bow with a sunflower brooch, a black underbust corset ' +
  'with gold buttons and chain, a long layered white, navy and orange ruffled skirt with gold ' +
  'embroidery and sunflower ribbon bows, white lace-up boots, and a brown antique book.';

const NEGATIVE =
  'decorative frame, ornate border, floral border, sunflowers around her, scattered flowers, short ' +
  'skirt, black shoes, black boots, different hair color, blue hair, blue eyes, glasses, character ' +
  'sheet, multiple characters, duplicate, portrait, bust, close-up, cropped, cut off feet, out of ' +
  'frame, extra limbs, extra fingers, deformed hands, text, watermark, signature, logo, blurry, low ' +
  'quality';

const STYLE =
  'Polished modern Japanese anime illustration, crisp line art, soft cel shading, warm orange-gold ' +
  'palette, high detail, full body head to toe, entire figure including hair tips and boots inside ' +
  'the frame, centered, front view.';

const BACKGROUND =
  'Flat uniform pure white background, evenly lit; no gradient, texture, scenery, floor, shadow, ' +
  'reflection, vignette, frame, border or other objects.';

const KEEP =
  'Change only her pose and expression; keep the exact character design, outfit, full-body framing ' +
  'and white background unchanged.';

const CLAUDE = {
  idle: `${STYLE} ${CHARACTER} She stands calmly, both hands resting on the closed book at her waist, a soft neutral expression, looking at the viewer. ${BACKGROUND}`,
  listening: `${STYLE} ${CHARACTER} She is listening attentively but calmly: her right hand is raised beside her right ear with the palm open, her head tilted slightly to one side, her left hand holding the closed brown book down at her waist, calm alert amber eyes, lips softly closed, a composed attentive expression. ${KEEP} ${BACKGROUND}`,
  excited: `${STYLE} ${CHARACTER} She is quietly delighted: a warm, bright smile, sparkling amber eyes, her hands lifting the closed brown book slightly toward her chest, relaxed shoulders, and three faint golden sparkles beside her head. ${KEEP} ${BACKGROUND}`,
  sad: `${STYLE} ${CHARACTER} She is quietly sad: both arms holding the closed brown book close to her chest, shoulders slightly lowered, her head bowed a little, eyes half-closed and looking down, a single tear at the corner of one eye, and a soft restrained frown. ${KEEP} ${BACKGROUND}`,
  asleep: `${STYLE} ${CHARACTER} She is peacefully asleep standing up: both eyes completely closed with soft lashes, her head tilted gently to one side, arms relaxed with the closed brown book held loosely against her waist, a serene expression, and two faint translucent Z marks above her head. ${KEEP} ${BACKGROUND}`,
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function api(path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) fail(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}

async function upload(file) {
  const type = extname(file).slice(1).toLowerCase();
  const preset = (await api('/init-image', { extension: type })).uploadInitImage;
  const form = new FormData();
  for (const [name, value] of Object.entries(JSON.parse(preset.fields))) form.append(name, value);
  form.append(
    'file',
    new Blob([await readFile(file)], { type: type === 'png' ? 'image/png' : 'image/jpeg' }),
    basename(file),
  );
  const res = await fetch(preset.url, { method: 'POST', body: form });
  if (!res.ok) fail(`upload ${res.status} ${await res.text()}`);
  console.log(`uploaded ${basename(file)}: ${preset.id}`);
  return preset.id;
}

async function request({
  prompt,
  negative = NEGATIVE,
  ref,
  init,
  presetInitId,
  initStrength = INIT_STRENGTH,
  out,
  refStrength = 'High',
  pose,
  cnWeight = 0.45,
}) {
  if (prompt.length > 1500) fail(`prompt is ${prompt.length} chars; Leonardo max is 1500`);
  const initId = presetInitId ?? (init ? await upload(init) : null);
  const [refId, poseId] = await Promise.all([
    ref ? upload(ref) : Promise.resolve(null),
    pose ? upload(pose) : Promise.resolve(null),
  ]);
  const controlnets = [];
  if (refId) {
    controlnets.push({ initImageId: refId, initImageType: 'UPLOADED', preprocessorId: 133, strengthType: refStrength });
  }
  if (poseId) {
    controlnets.push({ initImageId: poseId, initImageType: 'UPLOADED', preprocessorId: 21, weight: cnWeight });
  }
  const body = {
    prompt,
    negative_prompt: negative,
    modelId: MODEL,
    width: WIDTH,
    height: HEIGHT,
    num_images: 1,
    seed: SEED,
    guidance_scale: 7,
    alchemy: false,
    ultra: false,
    nsfw: false,
  };
  if (initId) {
    body.init_image_id = initId;
    body.init_strength = initStrength;
  }
  if (controlnets.length) body.controlnets = controlnets;
  const { generationId } = (await api('/generations', body)).sdGenerationJob;
  console.log(`generation ${generationId}`);
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const job = (await api(`/generations/${generationId}`)).generations_by_pk;
    if (job.status === 'FAILED') fail(JSON.stringify(job));
    if (job.status !== 'COMPLETE') {
      console.log(job.status);
      continue;
    }
    const url = job.generated_images[0].url;
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) fail(`download ${res.status}`);
    await mkdir(resolve(out, '..'), { recursive: true });
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    await writeFile(
      out.replace(/\.[^.]+$/, '.json'),
      JSON.stringify(
        { generationId, prompt, negative, init, initId, initStrength: initId ? initStrength : null, ref, refId, controlnets },
        null,
        2,
      ),
    );
    console.log(`saved ${out}`);
    return;
  }
  fail('timed out');
}

// Nano Banana Pro image references accept a role weight per image, but only in the
// {id, type: UPLOADED} form — the BASE64 form cannot carry `strength`. References are
// therefore uploaded through /init-image first, as the API docs show.
async function gemini({ prompt, refs = [], out, width = 1696, height = 2528, model = 'gemini-image-2', seed, plainRefs = false, quality, styleId }) {
  if (prompt.length > 7500) fail(`prompt is ${prompt.length} chars; Nano Banana Pro max is 7500`);
  const imageReference = [];
  for (const { file, strength = 'MID' } of refs) {
    const id = await upload(file);
    imageReference.push(
      plainRefs ? { image: { id, type: 'UPLOADED' } } : { image: { id, type: 'UPLOADED' }, strength },
    );
  }
  const parameters = {
    prompt,
    width,
    height,
    quantity: 1,
    prompt_enhance: 'OFF',
    guidances: { image_reference: imageReference },
  };
  if (quality) parameters.quality = quality;
  if (styleId) parameters.style_ids = [styleId];
  if (seed) parameters.seed = Number(seed);
  const res = await fetch(`${API2}/generations`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, public: false, parameters }),
  });
  const body = await res.json();
  const generate = body.generate;
  if (!generate?.generationId) fail(`${res.status} ${JSON.stringify(body).slice(0, 600)}`);
  const id = generate.generationId;
  const cost = generate.cost?.amount ?? '?';
  console.log(`generation ${id} $${cost}`);

  let url = '';
  for (let i = 0; i < 150; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const generation = (await api(`/generations/${id}`)).generations_by_pk;
    if (generation?.status === 'COMPLETE') {
      url = generation.generated_images[0].url;
      break;
    }
    if (generation?.status === 'FAILED') fail('generation failed');
    console.log(generation?.status ?? 'PENDING');
  }
  if (!url) fail('timed out');

  const image = Buffer.from(await (await fetch(url)).arrayBuffer());
  await mkdir(resolve(out, '..'), { recursive: true });
  await writeFile(out, image);
  await writeFile(
    out.replace(/\.[^.]+$/, '.json'),
    JSON.stringify(
      {
        id,
        model,
        size: [width, height],
        cost,
        url,
        prompt,
        seed: seed ? Number(seed) : null,
        refs: imageReference.map((ref, i) => ({ file: refs[i].file, ...ref.image, strength: ref.strength ?? null })),
      },
      null,
      2,
    ),
  );
  console.log(`saved ${out} ${image.length} bytes`);
}

function args(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) parsed._.push(token);
    else parsed[token.slice(2)] = argv[++i] ?? true;
  }
  return parsed;
}

const cli = args(process.argv.slice(2));
if (!KEY) fail('LEONARDO_KEY is not set');
if (cli._[0] === 'claude') {
  const state = cli._[1];
  if (!state || state === 'all' || cli._.length !== 2) fail('pass exactly one state, e.g. claude listening');
  if (!(state in CLAUDE)) fail(`unknown state: ${state}`);
  const initId = await upload(cli.ref ?? SAMPLE);
  await request({
    prompt: CLAUDE[state],
    presetInitId: initId,
    initStrength: Number(cli['init-strength'] ?? INIT_STRENGTH),
    pose: cli.pose,
    cnWeight: Number(cli['cn-weight'] ?? 0.6),
    out: `art-src/claude/raw/${state}.jpg`,
  });
} else if (cli._[0] === 'gemini') {
  if (!cli.out || (!cli.prompt && !cli['prompt-file'])) fail('gemini needs --out and --prompt or --prompt-file');
  if (!cli.force && (await readFile(cli.out).catch(() => null))) {
    fail(`${cli.out} already exists; pass --force to overwrite`);
  }
  const refs = cli.refs
    ? cli.refs.split(',').map((spec) => {
        const [file, strength = 'MID'] = spec.split('=');
        if (!['LOW', 'MID', 'HIGH'].includes(strength)) fail(`bad strength in ${spec}; use LOW, MID or HIGH`);
        return { file, strength };
      })
    : [
        cli.ref && { file: cli.ref, strength: cli['ref-strength'] ?? 'HIGH' },
        cli['style-ref'] && { file: cli['style-ref'], strength: cli['style-strength'] ?? 'HIGH' },
        cli['face-ref'] && { file: cli['face-ref'], strength: cli['face-strength'] ?? 'HIGH' },
      ].filter(Boolean);
  if (!refs.length) fail('gemini needs at least one reference: --refs file=STRENGTH,... or --ref');
  const prompt = cli['prompt-file'] ? await readFile(cli['prompt-file'], 'utf8') : cli.prompt;
  await gemini({
    prompt: prompt.trim(),
    refs,
    out: cli.out,
    width: Number(cli.width ?? 1696),
    height: Number(cli.height ?? 2528),
    model: cli.model ?? 'gemini-image-2',
    seed: cli.seed,
    plainRefs: cli['plain-refs'] === true,
    quality: cli.quality,
    styleId: cli['style-id'],
  });
} else if (cli._[0] === 'image') {
  if ((!cli.ref && !cli.init) || !cli.prompt || !cli.out) fail('image needs --init or --ref, --prompt and --out');
  await request({
    prompt: cli.prompt,
    negative: cli.negative ?? NEGATIVE,
    ref: cli.init ? undefined : cli.ref,
    init: cli.init,
    initStrength: Number(cli['init-strength'] ?? INIT_STRENGTH),
    out: cli.out,
    refStrength: cli['ref-strength'] ?? 'High',
    pose: cli.pose,
    cnWeight: Number(cli['cn-weight'] ?? 0.45),
  });
} else {
  fail(
    'usage: leonardo.mjs claude <state|all> [--ref sample.jpg] [--init-strength 0.55] | ' +
      'leonardo.mjs gemini --refs sheet.jpg=HIGH,face.jpg=HIGH,pose.jpg=MID [--seed 1234] --prompt-file p.txt --out out.jpg | ' +
      'leonardo.mjs gemini --ref ref.jpg [--style-ref style.jpg] [--face-ref face.jpg] --prompt-file p.txt --out out.jpg | ' +
      'leonardo.mjs image --init ... --prompt ... --out ...',
  );
}
