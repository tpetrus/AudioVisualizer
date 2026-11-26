// Tunables of the enhanced graphics look (dancingCharacterEnhanced.ts). Every number that changes how it looks or how
// much it costs lives here, so the mood can be adjusted without touching the logic.

// ---- Tone mapping ----

// Which operator tone maps the lit materials (the character and the frame). AgX is chosen over Neutral because the
// character's skin and the colored spill lights sit near the top of the range, and AgX rolls bright saturated colors
// off toward white instead of clipping them to a hue. The LED tiles, seams and beams are never tone mapped (see
// dancingCharacterEnhanced.ts), so the operator cannot desaturate the signature rainbow floor.
export const ENHANCED_TONE_MAPPING = 'agx' as const;
// Exposure of the tone mapper. 1 keeps the club's existing light intensities as tuned for standard mode.
export const ENHANCED_TONE_MAPPING_EXPOSURE = 1;

// ---- Shadows ----

// Shadow map size (pixels per side) of the key light. 2048 gives crisp edges on a figure about 2 m tall; the map only
// covers the fitted box around the character, so it is spent where it matters.
export const ENHANCED_SHADOW_MAP_SIZE = 2048;
// A small negative bias plus a normal bias removes shadow acne on the curved body without detaching the shadow from the
// feet. Both are in world units, and the shadow camera is about 3 units wide.
export const ENHANCED_SHADOW_BIAS = -0.0004;
export const ENHANCED_SHADOW_NORMAL_BIAS = 0.02;
// World units added around the character's box on every side when the shadow camera is fitted, so limbs that swing
// outside the measured box (the box is taken from the pose at load time) still cast.
export const ENHANCED_SHADOW_MARGIN = 0.6;
// Extra depth behind the character in the light's view. The shadow lands on the floor, which is farther from the light
// than the figure, and a receiver beyond the shadow camera's far plane would never be shadowed.
export const ENHANCED_SHADOW_DEPTH_MARGIN = 8;
// Smallest near distance of the shadow camera.
export const ENHANCED_SHADOW_MIN_NEAR = 0.1;
// Opacity of the shadow on the LED floor. The floor is bright and self-lit, so a fairly strong black is needed to read.
export const ENHANCED_CATCHER_OPACITY = 0.55;

// ---- The floor layers ----

// The catcher and the glass layer sit above the tile tops by these heights (world units). They are far enough apart,
// together with the polygon offsets below, that the layers never fight for depth with the tiles or each other, and
// close enough that the glass still reads as lying on the tiles.
export const ENHANCED_CATCHER_LIFT = 0.004;
export const ENHANCED_GLASS_LIFT = 0.008;
// Pulls the layers toward the camera in the depth buffer; a second line of defense against depth fighting at a grazing
// view, where a few millimeters are less than one depth step.
export const ENHANCED_POLYGON_OFFSET_FACTOR = -2;
export const ENHANCED_POLYGON_OFFSET_UNITS = -2;
// Draw order of the layers: after the opaque tiles, the glass last so it blends over the shadow.
export const ENHANCED_CATCHER_RENDER_ORDER = 1;
export const ENHANCED_GLASS_RENDER_ORDER = 2;

// ---- The glass reflection layer ----

// Opacity of the reflection over the tiles. Low, so the LED pattern clearly shows through and the reflection only
// adds a sheen of the dancer and the beams.
export const ENHANCED_GLASS_OPACITY = 0.22;
// The reflection's render target is this share of the renderer's drawing buffer in each direction. The reflection is
// faint and slightly soft anyway, and a second scene render at full size would double the cost on strong GPUs too.
export const ENHANCED_GLASS_RESOLUTION_FACTOR = 0.5;
// Smallest side of the reflection's render target, so a tiny canvas still gets a usable texture.
export const ENHANCED_GLASS_MIN_RESOLUTION = 64;
// MSAA samples of the reflection target. 0: the layer is faint and soft, so edges need no smoothing.
export const ENHANCED_GLASS_SAMPLES = 0;
// Reflector clip bias: keeps geometry exactly on the plane (the tiles) out of the reflection.
export const ENHANCED_GLASS_CLIP_BIAS = 0.003;
// Tint multiplied over the reflection (a cool gray, so the mirror image is not brighter than the room).
export const ENHANCED_GLASS_COLOR = '#9aa3b8';

// ---- The sky dome ----

// Radius of the dome. Inside the camera's far plane (200) with room to spare, and far beyond the fog's end (24), so it
// reads as the sky at any camera distance.
export const ENHANCED_SKY_RADIUS = 150;
// Segments of the dome sphere; the sky texture is smooth, so a coarse sphere is enough.
export const ENHANCED_SKY_WIDTH_SEGMENTS = 32;
export const ENHANCED_SKY_HEIGHT_SEGMENTS = 16;
// The sky texture's brightness: the club is a dark room and the sky is only a backdrop, so it is dimmed a lot.
export const ENHANCED_SKY_DARKEN = 0.28;
// The sky fades into the fog color between these elevations (sine of the angle above the horizon, 0 at the horizon and
// 1 straight up). The converted sky has a bright glow band right at the horizon; the gradient hides it and makes the
// horizon match the club's fog color exactly, so there is no seam where the floor's fog meets the sky.
export const ENHANCED_SKY_HORIZON_START = 0.04;
export const ENHANCED_SKY_HORIZON_END = 0.5;
// The shape of the gradient: higher keeps the sky dark and fog-like for longer before it shows.
export const ENHANCED_SKY_HORIZON_POWER = 1.5;
// Draw order of the dome: before everything else.
export const ENHANCED_SKY_RENDER_ORDER = -1000;

// ---- Environment lighting ----

// Intensity of the environment (scene.environmentIntensity). Low, so the dark club mood stays and the environment only
// lifts the character's and the frame's reflections. The room map is a neutral studio; the HDR is a brighter studio, so
// it gets less.
export const ENHANCED_ROOM_ENVIRONMENT_INTENSITY = 0.35;
export const ENHANCED_HDR_ENVIRONMENT_INTENSITY = 0.25;
// Blur sigma (radians) of the PMREM of the room scene, as the cubes visualizer uses it.
export const ENHANCED_ROOM_SIGMA = 0.04;
// Intensity written to the character's standard materials. (Materials without their own map take the scene's
// environment intensity above; this applies to any that carry one.)
export const ENHANCED_CHARACTER_ENV_INTENSITY = 1;

// ---- Textures ----

// Anisotropic filtering of the character's and the frame's textures, capped by what the GPU supports. 8 is the
// point where grazing views of the floor frame stop smearing and the cost stays small.
export const ENHANCED_MAX_ANISOTROPY = 8;
// The frame's concrete maps repeat this many times over a bar (u along the bar's long side is stretched by the bar's
// scale, so a low value keeps the grain from looking streaked).
export const ENHANCED_FRAME_REPEAT_U = 2;
export const ENHANCED_FRAME_REPEAT_V = 1;
// The frame's roughness multiplier once the roughness map is in (the map holds the real variation).
export const ENHANCED_FRAME_ROUGHNESS = 1;
// How strongly the frame's normal map bends the light.
export const ENHANCED_FRAME_NORMAL_SCALE = 0.8;
