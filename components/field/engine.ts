import { GLSL_NOISE, snoise, surfaceHeight } from './noise'
import { GLYPH_WEIGHTS, PARA_INK, PARA_LINES, lineIndent, lineRight } from '@/lib/paragraph'

/**
 * TELMA CONVERSATION FIELD: the engine.
 *
 * A sculpture of tens of thousands of characters, seen from the front. Every
 * character is a point sprite that samples one cell of a glyph atlas drawn at
 * start-up in the site's own typeface, so nothing here is a dot dressed as a
 * letter: what reaches the screen is Suisse Intl, mipmapped.
 *
 * The form is a sheet folded deep towards and away from the camera and swirled
 * within its own plane. Where it turns edge-on its letters pile up on screen,
 * and those piles are the bright ridges that give the mass its relief. Around
 * the sheet, letters scatter off it as vapour. A travelling envelope decides
 * which part of the sheet is alive, thinning it stochastically towards the
 * edge, so the sculpture is dense at its core and dissolves letter by letter.
 *
 * Nothing is simulated: the whole form is a function of (sheet position, time)
 * evaluated in the vertex shader, one draw call. The CPU mirrors that function
 * only to answer one question, on click: which letter is under the cursor.
 *
 * Plain WebGL2, no library. The reference (poly.ai) does the same.
 */

// --- Glyphs -----------------------------------------------------------------

// The alphabet lives in lib/paragraph with the line rule: this field and the
// mark's settle are the same cloud at two sizes.
const ATLAS_COLS = 8
const ATLAS_ROWS = 4
const CELL = 64

// --- Composition --------------------------------------------------------------

type Preset = {
  fov: number
  eye: [number, number, number]
  target: [number, number, number]
  offset: [number, number, number]
  /** Resting orientation of the sculpture. */
  yaw: number
  pitch: number
  /** The sheet, in its own plane. */
  width: number
  height: number
  /** How deep the folds run towards and away from the camera. */
  fold: number
  count: number
  worldSize: number
  /** How far a glyph may sit off the sheet: what turns a cloth into a volume. */
  thickness: number
  /** The travelling mass: how far its centre wanders across the sheet. */
  massTravel: [number, number]
  /** And its radii, before the noise tears its outline. */
  massRadius: [number, number]
  /** Where the mass's path is centred. */
  massBias: number
  /** Slow drift of the whole sculpture: x, y, z offset, yaw and pitch. */
  sway: [number, number, number, number, number]
  dprCap: number
}

/**
 * Desktop sets the sculpture right of centre and low, the way the reference
 * does, and lets it wander under the copy. Phones are not the desktop scene
 * scaled down: the sculpture sits below the text, wanders less and is cropped
 * by the screen.
 */
function presetFor(width: number, lowPower: boolean): Preset {
  const scale = lowPower ? 0.55 : 1
  if (width < 768) {
    return {
      fov: 42,
      eye: [0, 0.5, 7.0],
      target: [0, 0.45, 0],
      offset: [0, -0.75, 0],
      yaw: -0.35,
      pitch: -0.38,
      // A phone frame is portrait and the sheet was landscape, so at this
      // distance only about a quarter of its width was ever in shot and the
      // glyphs that survived read as grain rather than as writing. Turned to
      // stand up in the frame, and the count raised to keep the same density
      // over the smaller sheet.
      width: 4.4,
      height: 7.6,
      fold: 3.0,
      count: Math.round(26000 * scale),
      worldSize: 0.055,
      thickness: 0.4,
      massTravel: [0.7, 0.3],
      massRadius: [1.8, 1.7],
      massBias: 0,
      sway: [0.2, 0.08, 0.2, 0.2, 0.06],
      dprCap: 2,
    }
  }
  return {
    fov: 34,
    eye: [0, 0.8, 8.2],
    target: [0, -0.1, 0],
    offset: [1.0, -0.35, 0],
    yaw: -0.35,
    pitch: -0.38,
    width: 11.5,
    height: 7.6,
    fold: 3.6,
    count: Math.round(44000 * scale),
    worldSize: 0.06,
    thickness: 0.5,
    massTravel: [2.0, 0.45],
    massRadius: [3.0, 2.35],
    massBias: 0.15,
    sway: [0.55, 0.15, 0.4, 0.25, 0.08],
    dprCap: 2,
  }
}

/**
 * Where the mass is at ambient time t. Two incommensurate periods across, so
 * the path never visibly repeats. Out and back takes about forty seconds.
 */
function massCentre(p: Preset, t: number, out: Float32Array) {
  out[0] = p.massBias + p.massTravel[0] * (0.8 * Math.sin(t * 0.116 + 0.6) + 0.2 * Math.sin(t * 0.191 + 2.1))
  out[1] = p.massTravel[1] * Math.sin(t * 0.053 + 1.9)
}

/** The same envelope the shader applies. */
function presence(x: number, y: number, t: number, cx: number, cy: number, p: Preset) {
  const dx = (x - cx) / p.massRadius[0]
  const dy = (y - cy) / p.massRadius[1]
  const r = Math.hypot(dx, dy) + 0.3 * snoise(x * 0.26, y * 0.26, t * 0.045)
  const core = 1 - smoothstep(0.15, 1.1, r)
  const clumps = smoothstep(-0.5, 0.35, snoise(x * 0.5 + 9.0, y * 0.5, t * 0.07))
  const gap = smoothstep(0.0, 0.06, Math.abs(snoise(x * 0.3 - 3.0, y * 0.3, t * 0.04)))
  return core * (0.75 + 0.25 * clumps) * gap
}

// --- Shaders ---------------------------------------------------------------------

const MAX_PULSES = 6

/** How fast the ambient clock runs against the wall clock. */
const AMBIENT_SPEED = 1.35

const VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;   // sheet x, y, offset off the sheet
layout(location = 1) in vec3 aMeta;  // glyph, scale, density

uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uRotM;         // the sculpture's orientation (drift + orbit)
uniform vec3 uOffset;
uniform float uAmb;         // ambient clock (s), frozen under reduced motion
uniform float uTime;        // wall clock (s), for the pulses
uniform float uWorldSize;
uniform float uViewportH;   // device px
uniform float uMaxPoint;
uniform float uAspect;
uniform vec3 uPointer;      // ndc x, ndc y, presence 0..1
uniform vec4 uPulse[${MAX_PULSES}]; // sheet x, sheet y, start, strength
uniform vec4 uCopy;         // ndc rect the copy sits in: x0, y0, x1, y1
uniform float uIntro;
uniform vec3 uEye;
uniform vec2 uMass;         // centre of the travelling mass, sheet coords
uniform vec2 uMassR;        // its radii
uniform float uFold;

flat out float vGlyph;
out float vIntensity;

${GLSL_NOISE}

// Which part of the sheet is alive. Mirrored by presence() in the engine.
float presence(vec2 p, float t) {
  vec2 d = (p - uMass) / uMassR;
  float r = length(d) + 0.3 * snoise(vec3(p * 0.26, t * 0.045));
  float core = 1.0 - smoothstep(0.15, 1.1, r);
  float clumps = smoothstep(-0.5, 0.35, snoise(vec3(p * 0.5 + vec2(9.0, 0.0), t * 0.07)));
  float gap = smoothstep(0.0, 0.06, abs(snoise(vec3(p * 0.3 - vec2(3.0, 0.0), t * 0.04))));
  return core * (0.75 + 0.25 * clumps) * gap;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// The sheet swirls within its own plane, so the silhouette keeps changing.
vec2 swirl(vec2 p, float t) {
  return p + 0.45 * vec2(
    snoise(vec3(p * 0.24, t * 0.035 + 1.0)),
    snoise(vec3(p * 0.24 + 5.2, t * 0.035 + 4.0))
  );
}

// And folds deep towards and away from the camera.
float fold(vec2 s, float t) {
  return uFold * surfaceHeight(s * 0.55, t);
}

void main() {
  vec2 p = aPos.xy;
  float t = uAmb;

  // Each letter has its own threshold, so near the edge of the envelope the
  // sheet thins out letter by letter instead of fading as a whole.
  float alive = presence(p, t);
  float threshold = hash12(p);
  float vis = smoothstep(threshold - 0.1, threshold + 0.1, alive * 1.6);
  if (vis < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vIntensity = 0.0;
    vGlyph = 0.0;
    return;
  }

  vec2 s = swirl(p, t);
  const float e = 0.06;
  float z = fold(s, t);
  float zx = fold(s + vec2(e, 0.0), t);
  float zy = fold(s + vec2(0.0, e), t);
  vec3 n = normalize(vec3(-(zx - z) / e, -(zy - z) / e, 1.0));

  // Pulses: a ring travelling out from the touch, like a pebble on cloth.
  float ripple = 0.0;
  float rippleLight = 0.0;
  for (int i = 0; i < ${MAX_PULSES}; i++) {
    vec4 pu = uPulse[i];
    float age = uTime - pu.z;
    if (pu.w <= 0.0 || age <= 0.0 || age > 7.0) continue;
    float d = distance(p, pu.xy);
    float x = d - age * 0.95;
    float width = 0.22 + age * 0.06;
    float env = exp(-(x * x) / (width * width));
    float decay = exp(-age * 0.62) * (1.0 - smoothstep(5.0, 7.0, age)) * smoothstep(0.0, 0.12, age);
    float amp = pu.w * 0.16 * decay / (1.0 + d * 0.9);
    ripple += amp * cos(x * 9.0) * env;
    rippleLight += pu.w * decay * env * 0.8;
  }

  // Off the sheet along its normal; the offset breathes on its own phase.
  float lift = aPos.z * (1.0 + 0.22 * sin(t * 0.33 + aMeta.y * 41.0));
  vec3 model = vec3(s, z + ripple) + n * lift;
  vec3 world = uRotM * model + uOffset;
  vec4 view = uView * vec4(world, 1.0);
  vec4 clip = uProj * view;

  // The cursor, measured on screen: it brightens, and draws the sheet a hair
  // towards the viewer.
  vec2 ndc = clip.xy / clip.w;
  vec2 dp = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
  float near = exp(-dot(dp, dp) / 0.16) * uPointer.z;
  if (near > 0.001) {
    model.z += 0.05 * near;
    world = uRotM * model + uOffset;
    view = uView * vec4(world, 1.0);
    clip = uProj * view;
  }

  float depth = -view.z;
  float size = uWorldSize * aMeta.y * uProj[1][1] * 0.5 * uViewportH / clip.w;
  gl_PointSize = clamp(size, 1.0, uMaxPoint);
  gl_Position = clip;
  vGlyph = aMeta.x;

  // Light: two-sided, a soft key from the upper left.
  vec3 wn = uRotM * n;
  float key = abs(dot(wn, normalize(vec3(-0.35, 0.55, 0.75))));
  float lum = 0.62 + 0.5 * key * key;
  lum += 0.55 * near + rippleLight;

  // Edge-on folds pile letters up on screen; that is the relief, so it is only
  // tempered here, not removed.
  float facing = abs(dot(wn, normalize(uEye - world)));
  float thin = mix(0.5, 1.0, smoothstep(0.05, 0.5, facing));

  // Far letters fade into the black.
  float depthFade = mix(0.25, 1.0, smoothstep(12.0, 6.0, depth));

  // Give the copy its air: distance to its box on screen, torn by noise.
  vec2 cc = (uCopy.xy + uCopy.zw) * 0.5;
  vec2 ch = (uCopy.zw - uCopy.xy) * 0.5;
  vec2 q = abs(ndc - cc) - ch;
  q.x *= uAspect;
  float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  sdf += 0.09 * snoise(vec3(ndc * 1.8, t * 0.05));
  float copyFade = mix(0.05, 1.0, smoothstep(-0.06, 0.36, sdf));

  // The core glows; the outskirts are a scatter.
  float core = 0.4 + 0.6 * smoothstep(0.0, 0.7, alive);

  float alpha = aMeta.z * vis * core * depthFade * copyFade * thin * uIntro;
  vIntensity = min(lum * alpha, 0.9);
}
`

const FRAG = /* glsl */ `#version 300 es
precision mediump float;

uniform sampler2D uAtlas;
flat in float vGlyph;
in float vIntensity;
out vec4 outColor;

void main() {
  vec2 cell = vec2(mod(vGlyph, ${ATLAS_COLS}.0), floor(vGlyph / ${ATLAS_COLS}.0));
  vec2 uv = (cell + gl_PointCoord) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  // Biased towards the sharper mip, then given a firmer edge: small glyphs
  // stay crisp instead of going soft.
  float ink = smoothstep(0.08, 0.6, texture(uAtlas, uv, -0.8).r);
  if (ink < 0.02) discard;
  outColor = vec4(vec3(0.93, 0.94, 0.94) * ink * vIntensity, 1.0);
}
`

// --- Small matrix helpers (column-major, no allocation per frame) -------------------

function perspective(out: Float32Array, fovDeg: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
}

function lookAt(out: Float32Array, eye: number[], target: number[]) {
  let bx = eye[0] - target[0], by = eye[1] - target[1], bz = eye[2] - target[2]
  let len = Math.hypot(bx, by, bz)
  bx /= len; by /= len; bz /= len
  // right = up(0,1,0) x back
  let rx = bz, ry = 0, rz = -bx
  len = Math.hypot(rx, ry, rz)
  rx /= len; ry /= len; rz /= len
  const ux = by * rz - bz * ry
  const uy = bz * rx - bx * rz
  const uz = bx * ry - by * rx
  out[0] = rx; out[1] = ux; out[2] = bx; out[3] = 0
  out[4] = ry; out[5] = uy; out[6] = by; out[7] = 0
  out[8] = rz; out[9] = uz; out[10] = bz; out[11] = 0
  out[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2])
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2])
  out[14] = -(bx * eye[0] + by * eye[1] + bz * eye[2])
  out[15] = 1
}

/** Rotation: yaw about y, then pitch about x. Column-major, for a mat3 uniform. */
function rotation(out: Float32Array, yaw: number, pitch: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const cb = Math.cos(pitch), sb = Math.sin(pitch)
  out[0] = c; out[1] = sb * s; out[2] = -cb * s
  out[3] = 0; out[4] = cb; out[5] = sb
  out[6] = s; out[7] = -sb * c; out[8] = cb * c
}

// --- The field --------------------------------------------------------------------

/** Deterministic, so the sculpture is the same one on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The static texture of the sheet: where letters live on it, before the
 * travelling envelope decides which of them are awake.
 *
 * ── IT IS A PARAGRAPH, NOT A CLOUD ─────────────────────────────────────────
 * This was a soft-edged rectangle with noise in it, which is the silhouette of
 * nothing. A cloud of letters still reads as weather, and weather is what every
 * other company in this category puts behind its headline.
 *
 * So the letters sit on lines, with gaps between them. Every line ends where it
 * ends, one in seven stops short because something finished there, and the line
 * after a short one starts indented. None of that is decoration: it is the
 * difference between a texture and something somebody said.
 *
 * It matters here more than it would anywhere else. Telma's material is speech,
 * and what the brand does with speech is keep almost none of it. A page is the
 * only shape that can later lose its lines one by one.
 */
function density(x: number, y: number, w: number, h: number) {
  // Soft at the bounds, so the page has no cut edge.
  const ex = 1 - smoothstep(0.88, 1.0, Math.abs(x) / (w / 2))
  const ey = 1 - smoothstep(0.84, 1.0, Math.abs(y) / (h / 2))

  const u = (x + w / 2) / w // 0 at the left margin, 1 at the right
  const lineH = h / PARA_LINES
  const i = Math.floor((y + h / 2) / lineH)
  const t = (y + h / 2) / lineH - i // 0..1 within the line

  // The line of ink, and the gap above and below it.
  const band = 1 - smoothstep(PARA_INK / 2 - 0.07, PARA_INK / 2 + 0.07, Math.abs(t - 0.5))

  // Where the line starts and ends. Both come from lib/paragraph, which is also
  // what the article covers draw, so the two surfaces are one system and not
  // two things that happen to look alike.
  const edge = 1 - smoothstep(lineRight(i) - 0.05, lineRight(i) + 0.01, u)
  const indent = lineIndent(i)
  const start = smoothstep(indent - 0.01, indent + 0.025, u)

  // Unevenness along the line, so it reads as written and not as printed.
  const grain = 0.72 + 0.28 * smoothstep(-0.6, 0.6, snoise(x * 0.55, y * 1.1, 4.0))

  return ex * ey * band * start * edge * grain
}

const STRIDE = 6

/**
 * Glyphs on a jittered grid over the sheet, each pushed off it by its own
 * amount: most stay close, a few drift far out as vapour. That is what turns a
 * sheet of letters into a cloud of them.
 */
function buildField(preset: Preset) {
  const { width: W, height: H, count, thickness } = preset
  const rand = mulberry32(20260514)

  const glyphBag: number[] = []
  GLYPH_WEIGHTS.forEach(([, weight], i) => {
    for (let k = 0; k < weight; k++) glyphBag.push(i)
  })

  // Estimate how much of the rectangle the density keeps, then size the grid
  // so that roughly `count` glyphs survive.
  //
  // Finer than it was. The density is banded now, and at 48 the probe sampled
  // about two points per line: it aliased against the bands and the estimate
  // came out wherever the phases happened to land, which moved the glyph count
  // with it.
  let mean = 0
  const probe = 160
  for (let i = 0; i < probe; i++) {
    for (let j = 0; j < probe; j++) {
      mean += density(((i + 0.5) / probe - 0.5) * W, ((j + 0.5) / probe - 0.5) * H, W, H)
    }
  }
  mean /= probe * probe
  const rowRatio = 1.1
  const sx = Math.sqrt((W * H * mean) / (count * rowRatio))
  const sy = sx * rowRatio

  const out: number[] = []
  for (let y = -H / 2; y < H / 2; y += sy) {
    const rowShift = rand() * sx
    for (let x = -W / 2 + rowShift; x < W / 2; x += sx * (0.85 + rand() * 0.3)) {
      const px = x + (rand() - 0.5) * sx * 0.6
      const py = y + (rand() - 0.5) * sy * 0.6
      const dens = density(px, py, W, H)
      if (rand() > dens) continue

      // Thicker where the noise says so: the volume is uneven too.
      const local = 0.3 + 0.7 * smoothstep(-0.35, 0.6, snoise(px * 0.38, py * 0.38, 21.0))
      const vapour = rand() < 0.09
      const gauss = (rand() + rand() + rand() - 1.5) / 1.5
      const lift = vapour ? (rand() * 2 - 1) * thickness * 2.6 : gauss * thickness * local

      const glyph = glyphBag[Math.floor(rand() * glyphBag.length)]
      const scale = 0.78 + rand() * 0.44
      const alpha = (vapour ? 0.55 : 1) * (0.45 + 0.55 * smoothstep(0.0, 0.6, dens))
      out.push(px, py, lift, glyph, scale, alpha)
    }
  }

  // Shuffle whole records, so drawing the first N of them is an even thinning
  // of the field. That is how the frame-rate fallback reduces density.
  const n = out.length / STRIDE
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    for (let k = 0; k < STRIDE; k++) {
      const tmp = out[i * STRIDE + k]
      out[i * STRIDE + k] = out[j * STRIDE + k]
      out[j * STRIDE + k] = tmp
    }
  }
  return { data: new Float32Array(out), count: n }
}

function drawAtlas(fontFamily: string) {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLS * CELL
  canvas.height = ATLAS_ROWS * CELL
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 46px ${fontFamily}`
  GLYPH_WEIGHTS.forEach(([ch], i) => {
    const cx = (i % ATLAS_COLS) * CELL + CELL / 2
    // One baseline for every glyph, as in set type: the comma hangs, the
    // tilde rises, and the line still reads as a line.
    const base = Math.floor(i / ATLAS_COLS) * CELL + 44
    ctx.fillText(ch, cx, base)
  })
  return canvas
}

// --- Engine ------------------------------------------------------------------------

export type FieldOptions = {
  canvas: HTMLCanvasElement
  /** Where the pointer is listened to: the hero, so the copy does not block it. */
  surface: HTMLElement
  /** Elements the sculpture should thin out behind. */
  copy: () => HTMLElement | null
  fontFamily: string
  /** Centre the sculpture instead of leaving the left column to the copy. */
  centered?: boolean
}

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]'

const fract = (x: number) => x - Math.floor(x)

export function createField({ canvas, surface, copy, fontFamily, centered = false }: FieldOptions) {
  const compose = (p: Preset): Preset =>
    centered
      ? {
          ...p,
          // Centred and closer: the sculpture is the subject of its frame, not
          // a backdrop beside copy, so the camera comes in and aims at it.
          offset: [0, 0, p.offset[2]],
          massBias: 0,
          massTravel: [p.massTravel[0] * 0.55, p.massTravel[1]],
          eye: [0, p.eye[1] * 0.7, p.eye[2] * 0.68],
          target: [0, -0.1, 0],
        }
      : p
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return null

  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
  const nav = navigator as Navigator & { deviceMemory?: number }
  const lowPower = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4

  // Program.
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed')
    }
    return s
  }
  const program = gl.createProgram()!
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed')
  }
  gl.useProgram(program)

  const u = (name: string) => gl.getUniformLocation(program, name)
  const U = {
    view: u('uView'), proj: u('uProj'), rotM: u('uRotM'), offset: u('uOffset'),
    amb: u('uAmb'), time: u('uTime'), worldSize: u('uWorldSize'),
    viewportH: u('uViewportH'), maxPoint: u('uMaxPoint'), aspect: u('uAspect'),
    pointer: u('uPointer'), pulse: u('uPulse'), copy: u('uCopy'),
    intro: u('uIntro'), atlas: u('uAtlas'), eye: u('uEye'),
    mass: u('uMass'), massR: u('uMassR'), fold: u('uFold'),
  }

  // Atlas.
  const atlas = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, atlas)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, drawAtlas(fontFamily))
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.uniform1i(U.atlas, 0)

  // Geometry.
  const vao = gl.createVertexArray()
  const vbo = gl.createBuffer()
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * 4, 12)

  gl.disable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  // Screen, not add: where letters overlap they brighten and then saturate
  // softly instead of clipping to solid white.
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR)
  gl.clearColor(10 / 255, 10 / 255, 10 / 255, 1)

  const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array

  // State, all allocated once.
  const viewM = new Float32Array(16)
  const projM = new Float32Array(16)
  const rotM = new Float32Array(9)
  const pulses = new Float32Array(MAX_PULSES * 4)
  for (let i = 0; i < MAX_PULSES; i++) pulses[i * 4 + 2] = -100
  let pulseIndex = 0
  let preset = compose(presetFor(window.innerWidth, lowPower))
  let presetKey = ''
  let field = new Float32Array(0)
  let total = 0
  let drawCount = 0
  let cssW = 1
  let cssH = 1
  let dpr = 1
  let raf = 0
  let visible = true
  let disposed = false
  let start = 0
  let last = 0
  let amb = 0
  let intro = 0
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, amount: 0, target: 0 }
  const copyRect = new Float32Array([2, 2, 2, 2])
  let slowFrames = 0
  let sampledFrames = 0

  // Held-and-dragged rotation. Eases back to rest once let go, so the
  // composition always comes home.
  const orbit = {
    yaw: 0, pitch: 0, vYaw: 0, vPitch: 0,
    held: false, dragging: false, id: -1,
    sx: 0, sy: 0, lx: 0, ly: 0, lt: 0,
  }

  // Where the sculpture is this frame. Shared by the shader and the picking.
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }
  const mass = new Float32Array(2)
  const updatePose = () => {
    const [sx, sy, sz, syaw, spitch] = preset.sway
    pose.x = preset.offset[0] + sx * Math.sin(amb * 0.077 + 2.4)
    pose.y = preset.offset[1] + sy * Math.sin(amb * 0.083 + 0.7)
    pose.z = preset.offset[2] + sz * Math.sin(amb * 0.039 + 4.1)
    // It turns as it travels, so it shows a different side on the way back.
    pose.yaw = preset.yaw + syaw * Math.sin(amb * 0.089 + 1.2) + orbit.yaw
    pose.pitch = preset.pitch + spitch * Math.sin(amb * 0.061 + 3.3) + orbit.pitch
    rotation(rotM, pose.yaw, pose.pitch)
    massCentre(preset, amb, mass)
  }

  const rebuild = () => {
    const built = buildField(preset)
    field = built.data
    total = built.count
    drawCount = total
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, field, gl.STATIC_DRAW)
  }

  const measureCopy = () => {
    const el = copy()
    if (!el) {
      copyRect.set([2, 2, 2, 2])
      return
    }
    const c = canvas.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const toX = (px: number) => ((px - c.left) / c.width) * 2 - 1
    const toY = (py: number) => 1 - ((py - c.top) / c.height) * 2
    copyRect[0] = toX(r.left)
    copyRect[1] = toY(r.bottom)
    copyRect[2] = toX(r.right)
    copyRect[3] = toY(r.top)
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    cssW = Math.max(1, rect.width)
    cssH = Math.max(1, rect.height)
    const next = compose(presetFor(cssW, lowPower))
    const key = `${next.count}:${next.width}`
    preset = next
    if (key !== presetKey) {
      presetKey = key
      rebuild()
    }
    dpr = Math.min(window.devicePixelRatio || 1, preset.dprCap)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    perspective(projM, preset.fov, cssW / cssH, 0.1, 40)
    lookAt(viewM, preset.eye, preset.target)
    measureCopy()
    if (reduced.matches) frame(performance.now())
  }

  // --- Picking: which letter is under the cursor? ---------------------------------
  // The shader's position function, replayed on the CPU for a sample of the
  // letters, projected, and the nearest visible one wins. Run only on click.
  const pick = (ndcX: number, ndcY: number): [number, number] | null => {
    const aspect = cssW / cssH
    const step = Math.max(1, Math.floor(total / 5000))
    let best = -1
    let bestD = 0.05 * 0.05
    for (let i = 0; i < total; i += step) {
      const o = i * STRIDE
      const px = field[o]
      const py = field[o + 1]
      const alive = presence(px, py, amb, mass[0], mass[1], preset)
      const threshold = fract(Math.sin(px * 12.9898 + py * 78.233) * 43758.5453)
      if (alive * 1.6 < threshold + 0.05) continue
      // swirl + fold, as in the shader (the small lift is left out).
      const sx = px + 0.45 * snoise(px * 0.24, py * 0.24, amb * 0.035 + 1.0)
      const sy = py + 0.45 * snoise(px * 0.24 + 5.2, py * 0.24 + 5.2, amb * 0.035 + 4.0)
      const sz = preset.fold * surfaceHeight(sx * 0.55, sy * 0.55, amb)
      const wx = rotM[0] * sx + rotM[3] * sy + rotM[6] * sz + pose.x
      const wy = rotM[1] * sx + rotM[4] * sy + rotM[7] * sz + pose.y
      const wz = rotM[2] * sx + rotM[5] * sy + rotM[8] * sz + pose.z
      const vx = viewM[0] * wx + viewM[4] * wy + viewM[8] * wz + viewM[12]
      const vy = viewM[1] * wx + viewM[5] * wy + viewM[9] * wz + viewM[13]
      const vz = viewM[2] * wx + viewM[6] * wy + viewM[10] * wz + viewM[14]
      const cw = -vz
      if (cw <= 0.1) continue
      const nx = (projM[0] * vx) / cw
      const ny = (projM[5] * vy) / cw
      const dx = (nx - ndcX) * aspect
      const dy = ny - ndcY
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best < 0 ? null : [field[best * STRIDE], field[best * STRIDE + 1]]
  }

  const ndcFrom = (e: PointerEvent): [number, number] | null => {
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null
    return [(x / r.width) * 2 - 1, 1 - (y / r.height) * 2]
  }

  const emit = (ndc: [number, number]) => {
    if (reduced.matches) return false
    const hit = pick(ndc[0], ndc[1])
    if (!hit) return false
    const o = pulseIndex * 4
    pulses[o] = hit[0]
    pulses[o + 1] = hit[1]
    pulses[o + 2] = (performance.now() - start) / 1000
    pulses[o + 3] = 1
    pulseIndex = (pulseIndex + 1) % MAX_PULSES
    return true
  }

  // --- Input --------------------------------------------------------------------------
  let touchStart: { x: number; y: number; t: number } | null = null

  const onMove = (e: PointerEvent) => {
    if (orbit.held && e.pointerId === orbit.id) {
      if (!orbit.dragging && Math.hypot(e.clientX - orbit.sx, e.clientY - orbit.sy) > 6) {
        orbit.dragging = true
        surface.style.cursor = 'grabbing'
      }
      if (orbit.dragging) {
        const r = canvas.getBoundingClientRect()
        const dYaw = ((e.clientX - orbit.lx) / r.width) * 3.2
        const dPitch = ((e.clientY - orbit.ly) / r.height) * 2.2
        const dt = Math.max(0.008, (e.timeStamp - orbit.lt) / 1000)
        orbit.yaw += dYaw
        orbit.pitch = Math.max(-0.8, Math.min(0.8, orbit.pitch + dPitch))
        orbit.vYaw = orbit.vYaw * 0.5 + (dYaw / dt) * 0.5
        orbit.vPitch = orbit.vPitch * 0.5 + (dPitch / dt) * 0.5
      }
      orbit.lx = e.clientX
      orbit.ly = e.clientY
      orbit.lt = e.timeStamp
    }
    if (e.pointerType === 'touch' || !finePointer.matches) return
    const ndc = ndcFrom(e)
    if (!ndc) {
      pointer.target = 0
      return
    }
    pointer.tx = ndc[0]
    pointer.ty = ndc[1]
    pointer.target = 1
  }
  const onLeave = () => {
    if (!orbit.held) pointer.target = 0
  }
  const release = () => {
    if (orbit.held && surface.hasPointerCapture?.(orbit.id)) {
      surface.releasePointerCapture(orbit.id)
    }
    orbit.held = false
    orbit.dragging = false
    orbit.id = -1
    surface.style.cursor = ''
  }
  const onDown = (e: PointerEvent) => {
    const target = e.target as Element | null
    if (target?.closest?.(INTERACTIVE)) return
    if (e.pointerType === 'touch') {
      // A tap, not a scroll: decided on release.
      touchStart = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      return
    }
    if (e.button !== 0) return
    const ndc = ndcFrom(e)
    if (!ndc) return
    emit(ndc)
    // Press and drag turns the sculpture. Not from the copy, where a press is
    // someone selecting text.
    if (reduced.matches || copy()?.contains(target as Node)) return
    orbit.held = true
    orbit.dragging = false
    orbit.id = e.pointerId
    orbit.sx = orbit.lx = e.clientX
    orbit.sy = orbit.ly = e.clientY
    orbit.lt = e.timeStamp
    orbit.vYaw = 0
    orbit.vPitch = 0
    surface.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === orbit.id) release()
    if (e.pointerType !== 'touch' || !touchStart) return
    const moved = Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y)
    const quick = e.timeStamp - touchStart.t < 400
    touchStart = null
    if (moved < 10 && quick) {
      const ndc = ndcFrom(e)
      if (ndc) emit(ndc)
    }
  }
  const onCancel = () => {
    touchStart = null
    release()
  }

  surface.addEventListener('pointermove', onMove, { passive: true })
  surface.addEventListener('pointerleave', onLeave)
  surface.addEventListener('pointerdown', onDown)
  surface.addEventListener('pointerup', onUp)
  surface.addEventListener('pointercancel', onCancel)
  surface.addEventListener('lostpointercapture', onCancel)
  window.addEventListener('blur', onCancel)

  // --- Frame -------------------------------------------------------------------------
  function frame(now: number) {
    if (disposed) return
    if (!start) start = now
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now

    const still = reduced.matches
    if (still) {
      amb = 42
      intro = 1
      pointer.amount = 0
      orbit.yaw = 0
      orbit.pitch = 0
    } else {
      amb += dt * AMBIENT_SPEED
      intro = Math.min(1, intro + dt / 2.4)
      // Follows the cursor gently, and lets go of it more gently still.
      const follow = 1 - Math.exp(-dt * 5)
      pointer.x += (pointer.tx - pointer.x) * follow
      pointer.y += (pointer.ty - pointer.y) * follow
      const rate = pointer.target > pointer.amount ? 2.2 : 1.1
      pointer.amount += (pointer.target - pointer.amount) * (1 - Math.exp(-dt * rate))

      // Let go: the spin carries on a moment, then the sculpture settles home.
      if (!orbit.held) {
        orbit.yaw += orbit.vYaw * dt
        orbit.pitch = Math.max(-0.8, Math.min(0.8, orbit.pitch + orbit.vPitch * dt))
        const damp = Math.exp(-dt * 3)
        orbit.vYaw *= damp
        orbit.vPitch *= damp
        const home = 1 - Math.exp(-dt * 0.6)
        orbit.yaw -= orbit.yaw * home
        orbit.pitch -= orbit.pitch * home
      }

      // If the device cannot hold the frame rate, thin the field rather than
      // let it stutter. Skips the first two seconds, which are noisy anyway.
      if (now - start > 2000 && drawCount > 4000) {
        sampledFrames++
        if (dt > 0.024) slowFrames++
        if (sampledFrames >= 90) {
          if (slowFrames > 45) drawCount = Math.round(drawCount * 0.75)
          sampledFrames = 0
          slowFrames = 0
        }
      }
    }

    updatePose()

    // An eased intro: the sculpture surfaces out of the black.
    const introEased = intro * intro * (3 - 2 * intro)

    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.useProgram(program)
    gl!.bindVertexArray(vao)
    gl!.uniformMatrix4fv(U.view, false, viewM)
    gl!.uniformMatrix4fv(U.proj, false, projM)
    gl!.uniformMatrix3fv(U.rotM, false, rotM)
    gl!.uniform3f(U.offset, pose.x, pose.y, pose.z)
    gl!.uniform2f(U.mass, mass[0], mass[1])
    gl!.uniform2f(U.massR, preset.massRadius[0], preset.massRadius[1])
    gl!.uniform1f(U.fold, preset.fold)
    gl!.uniform1f(U.amb, amb)
    gl!.uniform1f(U.time, (now - start) / 1000)
    gl!.uniform1f(U.worldSize, preset.worldSize)
    gl!.uniform1f(U.viewportH, canvas.height)
    gl!.uniform1f(U.maxPoint, Math.min(pointRange[1], 64 * dpr))
    gl!.uniform1f(U.aspect, cssW / cssH)
    gl!.uniform3f(U.pointer, pointer.x, pointer.y, pointer.amount)
    gl!.uniform4fv(U.pulse, pulses)
    gl!.uniform4fv(U.copy, copyRect)
    gl!.uniform1f(U.intro, introEased)
    gl!.uniform3f(U.eye, preset.eye[0], preset.eye[1], preset.eye[2])
    gl!.drawArrays(gl!.POINTS, 0, drawCount)

    if (!still && visible) raf = requestAnimationFrame(frame)
    else raf = 0
  }

  const play = () => {
    if (raf || disposed || reduced.matches || !visible || document.hidden) return
    last = 0
    raf = requestAnimationFrame(frame)
  }
  const pause = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) play()
    else pause()
  })
  io.observe(canvas)

  const ro = new ResizeObserver(() => resize())
  ro.observe(canvas)
  const copyEl = copy()
  if (copyEl) ro.observe(copyEl)

  const onVisibility = () => (document.hidden ? pause() : play())
  document.addEventListener('visibilitychange', onVisibility)
  const onMotion = () => {
    if (reduced.matches) {
      pause()
      frame(performance.now())
    } else play()
  }
  reduced.addEventListener('change', onMotion)

  resize()
  if (reduced.matches) frame(performance.now())
  else play()

  return {
    dispose() {
      disposed = true
      pause()
      release()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', onMotion)
      surface.removeEventListener('pointermove', onMove)
      surface.removeEventListener('pointerleave', onLeave)
      surface.removeEventListener('pointerdown', onDown)
      surface.removeEventListener('pointerup', onUp)
      surface.removeEventListener('pointercancel', onCancel)
      surface.removeEventListener('lostpointercapture', onCancel)
      window.removeEventListener('blur', onCancel)
      gl.deleteBuffer(vbo)
      gl.deleteVertexArray(vao)
      gl.deleteTexture(atlas)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
