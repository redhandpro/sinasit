// ===== script.js - JS کد شخصی هدر =====
/*main*/
let settings = {
  grid_size: 64,
  dye_size: 256,
  sim_speed: 5,
  contain_fluid: true,
  velocity_add_intensity: 0.28,
  velocity_add_radius: 0.001,
  velocity_diffusion: 1,
  dye_add_intensity: 0.8,
  dye_add_radius: 0.0035,
  dye_diffusion: 0.96204,
  viscosity: 0,
  vorticity: 0,
  pressure_iterations: 8,
  buffer_view: "dye",
  input_symmetry: "none"
};

let device, presentationFormat, canvas, context;

const mouseInfos = {
  current: null,
  last: null,
  velocity: null
};

// Buffers
let velocity,
  velocity0,
  dye,
  dye0,
  divergence,
  divergence0,
  pressure,
  pressure0,
  vorticity;

// Uniforms
const globalUniforms = {};
let time,
  dt,
  mouse,
  grid,
  uSimSpeed,
  vel_force,
  vel_radius,
  vel_diff,
  dye_force,
  dye_radius,
  dye_diff;
let viscosity, uVorticity, containFluid, uSymmetry, uRenderIntensity;

// Programs
let checkerProgram,
  updateDyeProgram,
  updateProgram,
  advectProgram,
  boundaryProgram,
  divergenceProgram;
let boundaryDivProgram,
  pressureProgram,
  boundaryPressureProgram,
  gradientSubtractProgram,
  advectDyeProgram;
let clearPressureProgram,
  vorticityProgram,
  vorticityConfinmentProgram,
  renderProgram;

function handlePointerMove(e) {
  const pointer = e.touches ? e.touches[0] : e;
  const rect = canvas.getBoundingClientRect();

  if (!mouseInfos.current) mouseInfos.current = [];
  mouseInfos.current[0] = (pointer.clientX - rect.left) / rect.width;
  mouseInfos.current[1] = 1 - (pointer.clientY - rect.top) / rect.height; // Invert Y
}

function onWebGPUDetectionError(error) {
  console.log("Could not initialize WebGPU: " + error);
  document.querySelector(".webgpu-not-supported").style.visibility = "visible";
  return false;
}

// Init the WebGPU context by checking first if everything is supported
// Returns true on init success, false otherwise
async function initContext() {
  if (navigator.gpu == null)
    return onWebGPUDetectionError("WebGPU NOT Supported");

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return onWebGPUDetectionError("No adapter found");

  device = await adapter.requestDevice();

  canvas = document.getElementById("fluid-webgpu");
  context = canvas.getContext("webgpu");
  if (!context) return onWebGPUDetectionError("Canvas does not support WebGPU");

  // If we got here, WebGPU seems to be supported

  // Init canvas
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.addEventListener("mousemove", handlePointerMove);
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    handlePointerMove(e);
  });
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handlePointerMove(e);
    mouseInfos.last = [...mouseInfos.current];
  });

  // Init  context
  presentationFormat = navigator.gpu.getPreferredCanvasFormat(adapter);

  context.configure({
    device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    alphaMode: "premultiplied"
  });

  // Init buffer sizes
  initSizes();

  // Resize event
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(refreshSizes, 150);
  });

  return true;
}

function refreshSizes() {
  initSizes();
  initBuffers();
  initPrograms();
  globalUniforms.gridSize.needsUpdate = [
    settings.grid_w,
    settings.grid_h,
    settings.dye_w,
    settings.dye_h,
    settings.dx,
    settings.rdx,
    settings.dyeRdx
  ];
}

// Init buffer & canvas dimensions to fit the screen while keeping the aspect ratio
// and downscaling the dimensions if they exceed the browsers capabilities
function initSizes() {
  const dpr = window.devicePixelRatio || 1;
  const aspectRatio = window.innerWidth / window.innerHeight;
  const maxBufferSize = device.limits.maxStorageBufferBindingSize;
  const maxCanvasSize = device.limits.maxTextureDimension2D;

  // Fit to screen while keeping the aspect ratio
  const getPreferredDimensions = (baseSize) => {
    let w, h;
    const scaledBaseSize = baseSize * dpr;

    if (aspectRatio > 1) {
      h = scaledBaseSize;
      w = Math.floor(h * aspectRatio);
    } else {
      w = scaledBaseSize;
      h = Math.floor(w / aspectRatio);
    }

    return getValidDimensions(w, h);
  };

  // Downscale if necessary to prevent crashes
  const getValidDimensions = (w, h) => {
    let downRatio = 1;

    // Prevent buffer size overflow
    if (w * h * 4 >= maxBufferSize)
      downRatio = Math.sqrt(maxBufferSize / (w * h * 4));

    // Prevent canvas size overflow
    if (w > maxCanvasSize) downRatio = maxCanvasSize / w;
    else if (h > maxCanvasSize) downRatio = maxCanvasSize / h;

    return {
      w: Math.floor(w * downRatio),
      h: Math.floor(h * downRatio)
    };
  };

  // Calculate simulation buffer dimensions
  let gridSize = getPreferredDimensions(settings.grid_size);
  settings.grid_w = gridSize.w;
  settings.grid_h = gridSize.h;

  // Calculate dye & canvas buffer dimensions
  let dyeSize = getPreferredDimensions(settings.dye_size);
  settings.dye_w = dyeSize.w;
  settings.dye_h = dyeSize.h;

  // Useful values for the simulation
  settings.rdx = settings.grid_size * 4;
  settings.dyeRdx = settings.dye_size * 4;
  settings.dx = 1 / settings.rdx;

  // Resize the canvas
  canvas.width = settings.dye_w;
  canvas.height = settings.dye_h;
}

/*shaders*/
const STRUCT_GRID_SIZE = `
struct GridSize {
  w : f32,
  h : f32,
  dyeW: f32,
  dyeH: f32,
  dx : f32,
  rdx : f32,
  dyeRdx : f32
}`;

const STRUCT_MOUSE = `
struct Mouse {
  pos: vec2<f32>,
  vel: vec2<f32>,
}`;

// This code initialize the pos and index variables and target only interior cells
const COMPUTE_START = `
var pos = vec2<f32>(global_id.xy);

if (pos.x == 0 || pos.y == 0 || pos.x >= uGrid.w - 1 || pos.y >= uGrid.h - 1) {
    return;
}      

let index = ID(pos.x, pos.y);`;

const COMPUTE_START_DYE = `
var pos = vec2<f32>(global_id.xy);

if (pos.x == 0 || pos.y == 0 || pos.x >= uGrid.dyeW - 1 || pos.y >= uGrid.dyeH - 1) {
    return;
}      

let index = ID(pos.x, pos.y);`;

// This code initialize the pos and index variables and target all cells
const COMPUTE_START_ALL = `    
var pos = vec2<f32>(global_id.xy);

if (pos.x >= uGrid.w || pos.y >= uGrid.h) {
    return;
}      

let index = ID(pos.x, pos.y);`;

const SPLAT_CODE = `
var m = uMouse.pos;
var v = uMouse.vel*2.;

var splat = createSplat(p, m, v, uRadius);
if (uSymmetry == 1. || uSymmetry == 3.) {splat += createSplat(p, vec2(1. - m.x, m.y), v * vec2(-1., 1.), uRadius);}
if (uSymmetry == 2. || uSymmetry == 3.) {splat += createSplat(p, vec2(m.x, 1. - m.y), v * vec2(1., -1.), uRadius);}
if (uSymmetry == 3. || uSymmetry == 4.) {splat += createSplat(p, vec2(1. - m.x, 1. - m.y), v * vec2(-1., -1.), uRadius);}
`;

/// APPLY FORCE SHADER ///

const updateVelocityShader = /* wgsl */ `

${STRUCT_GRID_SIZE}

struct Mouse {
  pos: vec2<f32>,
  vel: vec2<f32>,
}
@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_in : array<f32>;
@group(0) @binding(2) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(3) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(4) var<uniform> uGrid: GridSize;
@group(0) @binding(5) var<uniform> uMouse: Mouse;
@group(0) @binding(6) var<uniform> uForce : f32;
@group(0) @binding(7) var<uniform> uRadius : f32;
@group(0) @binding(8) var<uniform> uDiffusion : f32;
@group(0) @binding(9) var<uniform> uDt : f32;
@group(0) @binding(10) var<uniform> uTime : f32;
@group(0) @binding(11) var<uniform> uSymmetry : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn inBetween(x : f32, lower : f32, upper : f32) -> bool {
  return x > lower && x < upper;
}
fn inBounds(pos : vec2<f32>, xMin : f32, xMax : f32, yMin: f32, yMax : f32) -> bool {
  return inBetween(pos.x, xMin * uGrid.w, xMax * uGrid.w) && inBetween(pos.y, yMin * uGrid.h, yMax * uGrid.h);
}

fn createSplat(pos : vec2<f32>, splatPos : vec2<f32>, vel : vec2<f32>, radius : f32) -> vec2<f32> {
  var p = pos - splatPos;
  p.x *= uGrid.w / uGrid.h;
  var v = vel;
  v.x *= uGrid.w / uGrid.h;
  var splat = exp(-dot(p, p) / radius) * v;
  return splat;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    
    ${COMPUTE_START}

    let tmpT = uTime;
    var p = pos/vec2(uGrid.w, uGrid.h);

    ${SPLAT_CODE}
    
    splat *= uForce * uDt * 200.;

    x_out[index] = x_in[index]*uDiffusion + splat.x;
    y_out[index] = y_in[index]*uDiffusion + splat.y;
}`;

const updateDyeShader = /* wgsl */ `

${STRUCT_GRID_SIZE}

struct Mouse {
  pos: vec2<f32>,
  vel: vec2<f32>,
}
@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_in : array<f32>;
@group(0) @binding(2) var<storage, read> z_in : array<f32>;
@group(0) @binding(3) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(4) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(5) var<storage, read_write> z_out : array<f32>;
@group(0) @binding(6) var<uniform> uGrid: GridSize;
@group(0) @binding(7) var<uniform> uMouse: Mouse;
@group(0) @binding(8) var<uniform> uForce : f32;
@group(0) @binding(9) var<uniform> uRadius : f32;
@group(0) @binding(10) var<uniform> uDiffusion : f32;
@group(0) @binding(11) var<uniform> uTime : f32;
@group(0) @binding(12) var<uniform> uDt : f32;
@group(0) @binding(13) var<uniform> uSymmetry : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.dyeW); }
fn inBetween(x : f32, lower : f32, upper : f32) -> bool {
  return x > lower && x < upper;
}
fn inBounds(pos : vec2<f32>, xMin : f32, xMax : f32, yMin: f32, yMax : f32) -> bool {
  return inBetween(pos.x, xMin * uGrid.dyeW, xMax * uGrid.dyeW) && inBetween(pos.y, yMin * uGrid.dyeH, yMax * uGrid.dyeH);
}
// cosine based palette, 4 vec3 params
fn palette(t : f32, a : vec3<f32>, b : vec3<f32>, c : vec3<f32>, d : vec3<f32> ) -> vec3<f32> {
    return a + b*cos( 6.28318*(c*t+d) );
}

fn createSplat(pos : vec2<f32>, splatPos : vec2<f32>, vel : vec2<f32>, radius : f32) -> vec3<f32> {
  var p = pos - splatPos;
  p.x *= uGrid.w / uGrid.h;
  var v = vel;
  v.x *= uGrid.w / uGrid.h;
  var splat = exp(-dot(p, p) / radius) * length(v);
  return vec3(splat);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

    ${COMPUTE_START_DYE}

    let col_incr = 0.15;
    let col_start = palette(uTime/8., vec3(1), vec3(0.5), vec3(1), vec3(0, col_incr, col_incr*2.));

    var p = pos/vec2(uGrid.dyeW, uGrid.dyeH);

    ${SPLAT_CODE}

    splat *= col_start * uForce * uDt * 100.;

    x_out[index] = max(0., x_in[index]*uDiffusion + splat.x);
    y_out[index] = max(0., y_in[index]*uDiffusion + splat.y);
    z_out[index] = max(0., z_in[index]*uDiffusion + splat.z);
}`;

/// ADVECT SHADER ///

const advectShader = /* wgsl */ `

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_in : array<f32>;
@group(0) @binding(2) var<storage, read> x_vel : array<f32>;
@group(0) @binding(3) var<storage, read> y_vel : array<f32>;
@group(0) @binding(4) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(5) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(6) var<uniform> uGrid : GridSize;
@group(0) @binding(7) var<uniform> uDt : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn in(x : f32, y : f32) -> vec2<f32> { let id = ID(x, y); return vec2(x_in[id], y_in[id]); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  
    ${COMPUTE_START}
    
    var x = pos.x - uDt * uGrid.rdx * x_vel[index];
    var y = pos.y - uDt * uGrid.rdx * y_vel[index];

    if (x < 0) { x = 0; }
    else if (x >= uGrid.w - 1) { x = uGrid.w - 1; }
    if (y < 0) { y = 0; }
    else if (y >= uGrid.h - 1) { y = uGrid.h - 1; }

    let x1 = floor(x);
    let y1 = floor(y);
    let x2 = x1 + 1;
    let y2 = y1 + 1;

    let TL = in(x1, y2);
    let TR = in(x2, y2);
    let BL = in(x1, y1);
    let BR = in(x2, y1);

    let xMod = fract(x);
    let yMod = fract(y);
    
    let bilerp = mix( mix(BL, BR, xMod), mix(TL, TR, xMod), yMod );

    x_out[index] = bilerp.x;
    y_out[index] = bilerp.y;
}`;

const advectDyeShader = /* wgsl */ `

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_in : array<f32>;
@group(0) @binding(2) var<storage, read> z_in : array<f32>;
@group(0) @binding(3) var<storage, read> x_vel : array<f32>;
@group(0) @binding(4) var<storage, read> y_vel : array<f32>;
@group(0) @binding(5) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(6) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(7) var<storage, read_write> z_out : array<f32>;
@group(0) @binding(8) var<uniform> uGrid : GridSize;
@group(0) @binding(9) var<uniform> uDt : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.dyeW); }
fn in(x : f32, y : f32) -> vec3<f32> { let id = ID(x, y); return vec3(x_in[id], y_in[id], z_in[id]); }
fn vel(x : f32, y : f32) -> vec2<f32> { 
  let id = u32(i32(x) + i32(y) * i32(uGrid.w));
  return vec2(x_vel[id], y_vel[id]);
}

fn vel_bilerp(x0 : f32, y0 : f32) -> vec2<f32> {
    var x = x0 * uGrid.w / uGrid.dyeW;
    var y = y0 * uGrid.h / uGrid.dyeH;

    if (x < 0) { x = 0; }
    else if (x >= uGrid.w - 1) { x = uGrid.w - 1; }
    if (y < 0) { y = 0; }
    else if (y >= uGrid.h - 1) { y = uGrid.h - 1; }

    let x1 = floor(x);
    let y1 = floor(y);
    let x2 = x1 + 1;
    let y2 = y1 + 1;

    let TL = vel(x1, y2);
    let TR = vel(x2, y2);
    let BL = vel(x1, y1);
    let BR = vel(x2, y1);

    let xMod = fract(x);
    let yMod = fract(y);

    return mix( mix(BL, BR, xMod), mix(TL, TR, xMod), yMod );
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

    ${COMPUTE_START_DYE}

    let V = vel_bilerp(pos.x, pos.y);

    var x = pos.x - uDt * uGrid.dyeRdx * V.x;
    var y = pos.y - uDt * uGrid.dyeRdx * V.y;

    if (x < 0) { x = 0; }
    else if (x >= uGrid.dyeW - 1) { x = uGrid.dyeW - 1; }
    if (y < 0) { y = 0; }
    else if (y >= uGrid.dyeH - 1) { y = uGrid.dyeH - 1; }

    let x1 = floor(x);
    let y1 = floor(y);
    let x2 = x1 + 1;
    let y2 = y1 + 1;

    let TL = in(x1, y2);
    let TR = in(x2, y2);
    let BL = in(x1, y1);
    let BR = in(x2, y1);

    let xMod = fract(x);
    let yMod = fract(y);

    let bilerp = mix( mix(BL, BR, xMod), mix(TL, TR, xMod), yMod );

    x_out[index] = bilerp.x;
    y_out[index] = bilerp.y;
    z_out[index] = bilerp.z;
}`;

/// DIVERGENCE SHADER ///

const divergenceShader = /* wgsl */ `   

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_vel : array<f32>;
@group(0) @binding(1) var<storage, read> y_vel : array<f32>;
@group(0) @binding(2) var<storage, read_write> div : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn vel(x : f32, y : f32) -> vec2<f32> { let id = ID(x, y); return vec2(x_vel[id], y_vel[id]); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START}

  let L = vel(pos.x - 1, pos.y).x;
  let R = vel(pos.x + 1, pos.y).x;
  let B = vel(pos.x, pos.y - 1).y;
  let T = vel(pos.x, pos.y + 1).y;

  div[index] = 0.5 * uGrid.rdx * ((R - L) + (T - B));
}`;

/// PRESSURE SHADER ///

const pressureShader = /* wgsl */ `      

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> pres_in : array<f32>;
@group(0) @binding(1) var<storage, read> div : array<f32>;
@group(0) @binding(2) var<storage, read_write> pres_out : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn in(x : f32, y : f32) -> f32 { let id = ID(x, y); return pres_in[id]; }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START}
        
  let L = pos - vec2(1, 0);
  let R = pos + vec2(1, 0);
  let B = pos - vec2(0, 1);
  let T = pos + vec2(0, 1);

  let Lx = in(L.x, L.y);
  let Rx = in(R.x, R.y);
  let Bx = in(B.x, B.y);
  let Tx = in(T.x, T.y);

  let bC = div[index];

  let alpha = -(uGrid.dx * uGrid.dx);
  let rBeta = .25;

  pres_out[index] = (Lx + Rx + Bx + Tx + alpha * bC) * rBeta;
}`;

/// GRADIENT SUBTRACT SHADER ///

const gradientSubtractShader = /* wgsl */ `      

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> pressure : array<f32>;
@group(0) @binding(1) var<storage, read> x_vel : array<f32>;
@group(0) @binding(2) var<storage, read> y_vel : array<f32>;
@group(0) @binding(3) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(4) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(5) var<uniform> uGrid : GridSize;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn pres(x : f32, y : f32) -> f32 { let id = ID(x, y); return pressure[id]; }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START}

  let L = pos - vec2(1, 0);
  let R = pos + vec2(1, 0);
  let B = pos - vec2(0, 1);
  let T = pos + vec2(0, 1);

  let xL = pres(L.x, L.y);
  let xR = pres(R.x, R.y);
  let yB = pres(B.x, B.y);
  let yT = pres(T.x, T.y);
  
  let finalX = x_vel[index] - .5 * uGrid.rdx * (xR - xL);
  let finalY = y_vel[index] - .5 * uGrid.rdx * (yT - yB);

  x_out[index] = finalX;
  y_out[index] = finalY;
}`;

/// VORTICITY SHADER ///

const vorticityShader = /* wgsl */ `      

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_vel : array<f32>;
@group(0) @binding(1) var<storage, read> y_vel : array<f32>;
@group(0) @binding(2) var<storage, read_write> vorticity : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn vel(x : f32, y : f32) -> vec2<f32> { let id = ID(x, y); return vec2(x_vel[id], y_vel[id]); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START}

  let Ly = vel(pos.x - 1, pos.y).y;
  let Ry = vel(pos.x + 1, pos.y).y;
  let Bx = vel(pos.x, pos.y - 1).x;
  let Tx = vel(pos.x, pos.y + 1).x;

  vorticity[index] = 0.5 * uGrid.rdx * ((Ry - Ly) - (Tx - Bx));
}`;

/// VORTICITY CONFINMENT SHADER ///

const vorticityConfinmentShader = /* wgsl */ `      

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_vel_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_vel_in : array<f32>;
@group(0) @binding(2) var<storage, read> vorticity : array<f32>;
@group(0) @binding(3) var<storage, read_write> x_vel_out : array<f32>;
@group(0) @binding(4) var<storage, read_write> y_vel_out : array<f32>;
@group(0) @binding(5) var<uniform> uGrid : GridSize;
@group(0) @binding(6) var<uniform> uDt : f32;
@group(0) @binding(7) var<uniform> uVorticity : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }
fn vort(x : f32, y : f32) -> f32 { let id = ID(x, y); return vorticity[id]; }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START}

  let L = vort(pos.x - 1, pos.y);
  let R = vort(pos.x + 1, pos.y);
  let B = vort(pos.x, pos.y - 1);
  let T = vort(pos.x, pos.y + 1);
  let C = vorticity[index];

  var force = 0.5 * uGrid.rdx * vec2(abs(T) - abs(B), abs(R) - abs(L));

  let epsilon = 2.4414e-4;
  let magSqr = max(epsilon, dot(force, force));

  force = force / sqrt(magSqr);
  force *= uGrid.dx * uVorticity * uDt * C * vec2(1, -1);

  x_vel_out[index] = x_vel_in[index] + force.x;
  y_vel_out[index] = y_vel_in[index] + force.y;
}`;

/// CLEAR PRESSURE SHADER ///

const clearPressureShader = /* wgsl */ `  

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(2) var<uniform> uGrid : GridSize;
@group(0) @binding(3) var<uniform> uVisc : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START_ALL}

  x_out[index] = x_in[index]*uVisc;
}`;

/// BOUNDARY SHADER ///

const boundaryShader = /* wgsl */ `

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read> y_in : array<f32>;
@group(0) @binding(2) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(3) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(4) var<uniform> uGrid : GridSize;
@group(0) @binding(5) var<uniform> containFluid : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START_ALL}

  // disable scale to disable contained bounds
  var scaleX = 1.;
  var scaleY = 1.;

  if (pos.x == 0) { pos.x += 1; scaleX = -1.; }
  else if (pos.x == uGrid.w - 1) { pos.x -= 1; scaleX = -1.; }
  if (pos.y == 0) { pos.y += 1; scaleY = -1.; }
  else if (pos.y == uGrid.h - 1) { pos.y -= 1; scaleY = -1.; }

  if (containFluid == 0.) {
    scaleX = 1.;
    scaleY = 1.;
  }

  x_out[index] = x_in[ID(pos.x, pos.y)] * scaleX;
  y_out[index] = y_in[ID(pos.x, pos.y)] * scaleY;
}`;

/// BOUNDARY PRESSURE SHADER ///

const boundaryPressureShader = /* wgsl */ `    

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read> x_in : array<f32>;
@group(0) @binding(1) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(2) var<uniform> uGrid : GridSize;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.w); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START_ALL}

  if (pos.x == 0) { pos.x += 1; }
  else if (pos.x == uGrid.w - 1) { pos.x -= 1; }
  if (pos.y == 0) { pos.y += 1; }
  else if (pos.y == uGrid.h - 1) { pos.y -= 1; }

  x_out[index] = x_in[ID(pos.x, pos.y)];
}`;

const checkerboardShader = /* wgsl */ `    

${STRUCT_GRID_SIZE}

@group(0) @binding(0) var<storage, read_write> x_out : array<f32>;
@group(0) @binding(1) var<storage, read_write> y_out : array<f32>;
@group(0) @binding(2) var<storage, read_write> z_out : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;
@group(0) @binding(4) var<uniform> uTime : f32;

fn ID(x : f32, y : f32) -> u32 { return u32(x + y * uGrid.dyeW); }

fn noise(p_ : vec3<f32>) -> f32 {
  var p = p_;
	var ip=floor(p);
  p-=ip; 
  var s=vec3(7.,157.,113.);
  var h=vec4(0.,s.y, s.z,s.y+s.z)+dot(ip,s);
  p=p*p*(3. - 2.*p); 
  h=mix(fract(sin(h)*43758.5),fract(sin(h+s.x)*43758.5),p.x);
  var r=mix(h.xz,h.yw,p.y);
  h.x = r.x;
  h.y = r.y;
  return mix(h.x,h.y,p.z); 
}

fn fbm(p_ : vec3<f32>, octaveNum : i32) -> vec2<f32> {
  var p=p_;
	var acc = vec2(0.);	
	var freq = 1.0;
	var amp = 0.5;
  var shift = vec3(100.);
	for (var i = 0; i < octaveNum; i++) {
		acc += vec2(noise(p), noise(p + vec3(0.,0.,10.))) * amp;
    p = p * 2.0 + shift;
    amp *= 0.5;
	}
	return acc;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {

  ${COMPUTE_START_DYE}

  var uv = pos/vec2(uGrid.dyeW, uGrid.dyeH);
  var zoom = 4.;

  var smallNoise = fbm(vec3(uv.x*zoom*2., uv.y*zoom*2., uTime+2.145), 7) - .5;
  var bigNoise = fbm(vec3(uv.x*zoom, uv.y*zoom, uTime*.1+30.), 7) - .5;

  var noise = max(length(bigNoise) * 0.035, 0.);
  var noise2 = max(length(smallNoise) * 0.035, 0.);

  noise = noise + noise2 * .05;

  var czoom = 4.;
  var n = fbm(vec3(uv.x*czoom, uv.y*czoom, uTime*.1+63.1), 7)*.75+.25;
  var n2 = fbm(vec3(uv.x*czoom, uv.y*czoom, uTime*.1+23.4), 7)*.75+.25;
  
  var col = vec3(1.);

  x_out[index] += noise * col.x;
  y_out[index] += noise * col.y;
  z_out[index] += noise * col.z;
}`;

/*render*/
const renderShader = /* wgsl */ `
${STRUCT_GRID_SIZE}

struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(1) uv : vec2<f32>,
};

@group(0) @binding(0) var<storage, read> fieldX : array<f32>;
@group(0) @binding(1) var<storage, read> fieldY : array<f32>;
@group(0) @binding(2) var<storage, read> fieldZ : array<f32>;
@group(0) @binding(3) var<uniform> uGrid : GridSize;
@group(0) @binding(4) var<uniform> multiplier : f32;


@vertex
fn vertex_main(@location(0) position: vec4<f32>) -> VertexOut
{
    var output : VertexOut;
    output.position = position;
    output.uv = position.xy*.5+.5;
    return output;
}

@fragment
fn fragment_main(fragData : VertexOut) -> @location(0) vec4<f32>
{
    var w = uGrid.dyeW;
    var h = uGrid.dyeH;

    let fuv = vec2<f32>((floor(fragData.uv*vec2(w, h))));
    let id = u32(fuv.x + fuv.y * w);

    let r = fieldX[id];
    let g = fieldY[id];
    let b = fieldZ[id];
    let col = vec3(r, g, b);

    let alpha = clamp(length(col), 0.0, 1.0);
    return vec4(col * multiplier, alpha);
}
`;

// Renders 3 (r, g, b) storage buffers to the canvas
class RenderProgram {
  constructor() {
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      1,
      -1,
      1,
      0,
      1,
      1,
      -1,
      0,
      1,
      1,
      -1,
      0,
      1,
      -1,
      1,
      0,
      1,
      1,
      1,
      0,
      1
    ]);

    this.vertexBuffer = device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    const vertexBuffersDescriptors = [
      {
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x4"
          }
        ],
        arrayStride: 16,
        stepMode: "vertex"
      }
    ];

    const shaderModule = device.createShaderModule({
      code: renderShader
    });

    this.renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vertex_main",
        buffers: vertexBuffersDescriptors
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragment_main",
        targets: [
          {
            format: presentationFormat
          }
        ]
      },
      primitive: {
        topology: "triangle-list"
      }
    });

    // The r,g,b buffer containing the data to render
    this.buffer = new DynamicBuffer({
      dims: 3,
      w: settings.dye_w,
      h: settings.dye_h
    });

    // Uniforms
    const entries = [
      ...this.buffer.buffers,
      globalUniforms.gridSize.buffer,
      globalUniforms.render_intensity_multiplier.buffer
    ].map((b, i) => ({
      binding: i,
      resource: { buffer: b }
    }));

    this.renderBindGroup = device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    };
  }

  // Dispatch a draw command to render on the canvas
  dispatch(commandEncoder) {
    this.renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const renderPassEncoder = commandEncoder.beginRenderPass(
      this.renderPassDescriptor
    );

    renderPassEncoder.setPipeline(this.renderPipeline);
    renderPassEncoder.setBindGroup(0, this.renderBindGroup);
    renderPassEncoder.setVertexBuffer(0, this.vertexBuffer);
    renderPassEncoder.draw(6);
    renderPassEncoder.end();
  }
}

/*utils*/
// Creates and manage multi-dimensional buffers by creating a buffer for each dimension
class DynamicBuffer {
  constructor({
    dims = 1, // Number of dimensions
    w = settings.grid_w, // Buffer width
    h = settings.grid_h // Buffer height
  } = {}) {
    this.dims = dims;
    this.bufferSize = w * h * 4;
    this.w = w;
    this.h = h;
    this.buffers = new Array(dims).fill().map((_) =>
      device.createBuffer({
        size: this.bufferSize,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST
      })
    );
  }

  // Copy each buffer to another DynamicBuffer's buffers.
  // If the dimensions don't match, the last non-empty dimension will be copied instead
  copyTo(buffer, commandEncoder) {
    for (let i = 0; i < Math.max(this.dims, buffer.dims); i++) {
      commandEncoder.copyBufferToBuffer(
        this.buffers[Math.min(i, this.buffers.length - 1)],
        0,
        buffer.buffers[Math.min(i, buffer.buffers.length - 1)],
        0,
        this.bufferSize
      );
    }
  }

  // Reset all the buffers
  clear(queue) {
    for (let i = 0; i < this.dims; i++) {
      queue.writeBuffer(this.buffers[i], 0, new Float32Array(this.w * this.h));
    }
  }
}

// Manage uniform buffers relative to the compute shaders
class Uniform {
  constructor(name, { size, value } = {}) {
    this.name = name;
    this.size = size ?? (value && typeof value === "object" ? value.length : 1);
    this.needsUpdate = false;

    if (this.size === 1) {
      if (settings[name] == null) {
        settings[name] = value ?? 0;
        this.alwaysUpdate = true;
      }
    }

    if (this.size === 1 || value != null) {
      this.buffer = device.createBuffer({
        mappedAtCreation: true,
        size: this.size * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      const arrayBuffer = this.buffer.getMappedRange();
      const sourceValue = value ?? [settings[this.name]];
      const sourceArray =
        typeof sourceValue === "number"
          ? [sourceValue]
          : Array.isArray(sourceValue)
          ? sourceValue
          : [0]; // Default to [0] if value is invalid
      new Float32Array(arrayBuffer).set(new Float32Array(sourceArray));
      this.buffer.unmap();
    } else {
      this.buffer = device.createBuffer({
        size: this.size * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
    }

    globalUniforms[name] = this;
  }

  setValue(value) {
    settings[this.name] = value;
    this.needsUpdate = true;
  }

  update(queue, value) {
    if (this.needsUpdate || this.alwaysUpdate || value != null) {
      if (typeof this.needsUpdate !== "boolean") value = this.needsUpdate;
      queue.writeBuffer(
        this.buffer,
        0,
        new Float32Array(value ?? [parseFloat(settings[this.name])]),
        0,
        this.size
      );
      this.needsUpdate = false;
    }
  }
}

// Creates a shader module, compute pipeline & bind group to use with the GPU
class Program {
  constructor({
    buffers = [], // Storage buffers
    uniforms = [], // Uniform buffers
    shader, // WGSL Compute Shader as a string
    dispatchX = settings.grid_w, // Dispatch workers width
    dispatchY = settings.grid_h // Dispatch workers height
  }) {
    this.computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: shader }),
        entryPoint: "main"
      }
    });

    const storageEntries = buffers.map((b) => b.buffers).flat();
    const uniformEntries = uniforms
      .filter((u) => u && u.buffer)
      .map((u) => u.buffer);

    const allEntries = [...storageEntries, ...uniformEntries].map(
      (buffer, i) => ({
        binding: i,
        resource: { buffer }
      })
    );

    this.bindGroup = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: allEntries
    });

    this.dispatchX = dispatchX;
    this.dispatchY = dispatchY;
  }

  dispatch(passEncoder) {
    passEncoder.setPipeline(this.computePipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(this.dispatchX / 8),
      Math.ceil(this.dispatchY / 8)
    );
  }
}

/// Useful classes for cleaner understanding of the input and output buffers
/// used in the declarations of programs & fluid simulation steps

class AdvectProgram extends Program {
  constructor({
    in_quantity,
    in_velocity,
    out_quantity,
    uniforms,
    shader = advectShader,
    ...props
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({
      buffers: [in_quantity, in_velocity, out_quantity],
      uniforms,
      shader,
      ...props
    });
  }
}

class DivergenceProgram extends Program {
  constructor({
    in_velocity,
    out_divergence,
    uniforms,
    shader = divergenceShader
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({ buffers: [in_velocity, out_divergence], uniforms, shader });
  }
}

class PressureProgram extends Program {
  constructor({
    in_pressure,
    in_divergence,
    out_pressure,
    uniforms,
    shader = pressureShader
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({
      buffers: [in_pressure, in_divergence, out_pressure],
      uniforms,
      shader
    });
  }
}

class GradientSubtractProgram extends Program {
  constructor({
    in_pressure,
    in_velocity,
    out_velocity,
    uniforms,
    shader = gradientSubtractShader
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({
      buffers: [in_pressure, in_velocity, out_velocity],
      uniforms,
      shader
    });
  }
}

class BoundaryProgram extends Program {
  constructor({
    in_quantity,
    out_quantity,
    uniforms,
    shader = boundaryShader
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({ buffers: [in_quantity, out_quantity], uniforms, shader });
  }
}

class UpdateProgram extends Program {
  constructor({
    in_quantity,
    out_quantity,
    uniforms,
    shader = updateVelocityShader,
    ...props
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({ buffers: [in_quantity, out_quantity], uniforms, shader, ...props });
  }
}

class VorticityProgram extends Program {
  constructor({
    in_velocity,
    out_vorticity,
    uniforms,
    shader = vorticityShader,
    ...props
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({
      buffers: [in_velocity, out_vorticity],
      uniforms,
      shader,
      ...props
    });
  }
}

class VorticityConfinmentProgram extends Program {
  constructor({
    in_velocity,
    in_vorticity,
    out_velocity,
    uniforms,
    shader = vorticityConfinmentShader,
    ...props
  }) {
    uniforms ??= [globalUniforms.gridSize];
    super({
      buffers: [in_velocity, in_vorticity, out_velocity],
      uniforms,
      shader,
      ...props
    });
  }
}

function initBuffers() {
  velocity = new DynamicBuffer({ dims: 2 });
  velocity0 = new DynamicBuffer({ dims: 2 });

  dye = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h });
  dye0 = new DynamicBuffer({ dims: 3, w: settings.dye_w, h: settings.dye_h });

  divergence = new DynamicBuffer();
  divergence0 = new DynamicBuffer();

  pressure = new DynamicBuffer();
  pressure0 = new DynamicBuffer();

  vorticity = new DynamicBuffer();
}

function initUniforms() {
  time = new Uniform("time");
  dt = new Uniform("dt");
  mouse = new Uniform("mouseInfos", { size: 4 });
  grid = new Uniform("gridSize", {
    size: 7,
    value: [
      settings.grid_w,
      settings.grid_h,
      settings.dye_w,
      settings.dye_h,
      settings.dx,
      settings.rdx,
      settings.dyeRdx
    ]
  });
  uSimSpeed = new Uniform("sim_speed", { value: settings.sim_speed });
  vel_force = new Uniform("velocity_add_intensity", {
    value: settings.velocity_add_intensity
  });
  vel_radius = new Uniform("velocity_add_radius", {
    value: settings.velocity_add_radius
  });
  vel_diff = new Uniform("velocity_diffusion", {
    value: settings.velocity_diffusion
  });
  dye_force = new Uniform("dye_add_intensity", {
    value: settings.dye_add_intensity
  });
  dye_radius = new Uniform("dye_add_radius", {
    value: settings.dye_add_radius
  });
  dye_diff = new Uniform("dye_diffusion", {
    value: settings.dye_diffusion
  });
  viscosity = new Uniform("viscosity", {
    value: settings.viscosity
  });
  uVorticity = new Uniform("vorticity", {
    value: settings.vorticity
  });
  containFluid = new Uniform("contain_fluid", {
    value: settings.contain_fluid
  });
  uSymmetry = new Uniform("mouse_type", { value: 0 });
  uRenderIntensity = new Uniform("render_intensity_multiplier", { value: 1 });
}

function initPrograms() {
  checkerProgram = new Program({
    buffers: [dye],
    shader: checkerboardShader,
    dispatchX: settings.dye_w,
    dispatchY: settings.dye_h,
    uniforms: [grid, time]
  });

  updateDyeProgram = new UpdateProgram({
    in_quantity: dye,
    out_quantity: dye0,
    uniforms: [
      grid,
      mouse,
      dye_force,
      dye_radius,
      dye_diff,
      time,
      dt,
      uSymmetry
    ],
    dispatchX: settings.dye_w,
    dispatchY: settings.dye_h,
    shader: updateDyeShader
  });

  updateProgram = new UpdateProgram({
    in_quantity: velocity,
    out_quantity: velocity0,
    uniforms: [
      grid,
      mouse,
      vel_force,
      vel_radius,
      vel_diff,
      dt,
      time,
      uSymmetry
    ]
  });

  advectProgram = new AdvectProgram({
    in_quantity: velocity0,
    in_velocity: velocity0,
    out_quantity: velocity,
    uniforms: [grid, dt]
  });

  boundaryProgram = new BoundaryProgram({
    in_quantity: velocity,
    out_quantity: velocity0,
    uniforms: [grid, containFluid]
  });

  divergenceProgram = new DivergenceProgram({
    in_velocity: velocity0,
    out_divergence: divergence0
  });

  boundaryDivProgram = new BoundaryProgram({
    in_quantity: divergence0,
    out_quantity: divergence,
    shader: boundaryPressureShader
  });

  pressureProgram = new PressureProgram({
    in_pressure: pressure,
    in_divergence: divergence,
    out_pressure: pressure0
  });

  boundaryPressureProgram = new BoundaryProgram({
    in_quantity: pressure0,
    out_quantity: pressure,
    shader: boundaryPressureShader
  });

  gradientSubtractProgram = new GradientSubtractProgram({
    in_pressure: pressure,
    in_velocity: velocity0,
    out_velocity: velocity
  });

  advectDyeProgram = new AdvectProgram({
    in_quantity: dye0,
    in_velocity: velocity,
    out_quantity: dye,
    uniforms: [grid, dt],
    dispatchX: settings.dye_w,
    dispatchY: settings.dye_h,
    shader: advectDyeShader
  });

  clearPressureProgram = new UpdateProgram({
    in_quantity: pressure,
    out_quantity: pressure0,
    uniforms: [grid, viscosity],
    shader: clearPressureShader
  });

  vorticityProgram = new VorticityProgram({
    in_velocity: velocity,
    out_vorticity: vorticity
  });

  vorticityConfinmentProgram = new VorticityConfinmentProgram({
    in_velocity: velocity,
    in_vorticity: vorticity,
    out_velocity: velocity0,
    uniforms: [grid, dt, uVorticity]
  });

  renderProgram = new RenderProgram();
}

async function main() {
  // Init WebGPU Context
  const initializationSuccess = await initContext();
  if (!initializationSuccess) return;

  // Init buffers, uniforms and programs
  initBuffers();
  initUniforms();
  initPrograms();

  // Simulation reset
  function reset() {
    velocity.clear(device.queue);
    dye.clear(device.queue);
    pressure.clear(device.queue);

    settings.time = 0;
  }
  settings.reset = reset;

  // Fluid simulation step
  function dispatchComputePipeline(passEncoder) {
    // Add velocity and dye at the mouse position
    updateDyeProgram.dispatch(passEncoder);
    updateProgram.dispatch(passEncoder);

    // Advect the velocity field through itself
    advectProgram.dispatch(passEncoder);
    boundaryProgram.dispatch(passEncoder); // boundary conditions

    // Compute the divergence
    divergenceProgram.dispatch(passEncoder);
    boundaryDivProgram.dispatch(passEncoder); // boundary conditions

    // Solve the jacobi-pressure equation
    for (let i = 0; i < settings.pressure_iterations; i++) {
      pressureProgram.dispatch(passEncoder);
      boundaryPressureProgram.dispatch(passEncoder); // boundary conditions
    }

    // Subtract the pressure from the velocity field
    gradientSubtractProgram.dispatch(passEncoder);
    clearPressureProgram.dispatch(passEncoder);

    // Compute & apply vorticity confinment
    vorticityProgram.dispatch(passEncoder);
    vorticityConfinmentProgram.dispatch(passEncoder);

    // Advect the dye through the velocity field
    advectDyeProgram.dispatch(passEncoder);
  }

  let lastFrame = performance.now();

  // Render loop
  async function step() {
    requestAnimationFrame(step);

    // Update time
    const now = performance.now();
    settings.dt =
      Math.min(1 / 60, (now - lastFrame) / 1000) * settings.sim_speed;
    settings.time += settings.dt;
    lastFrame = now;

    // Update uniforms
    Object.values(globalUniforms).forEach((u) => u.update(device.queue));

    // Update custom uniform
    if (mouseInfos.current) {
      let dx = mouseInfos.last ? mouseInfos.current[0] - mouseInfos.last[0] : 0;
      let dy = mouseInfos.last ? mouseInfos.current[1] - mouseInfos.last[1] : 0;

      const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (isMobile) {
        const touchStrengthMultiplier = 0.2;
        dx *= touchStrengthMultiplier;
        dy *= touchStrengthMultiplier;
      }

      mouseInfos.velocity = [dx, dy];

      mouse.update(device.queue, [
        ...mouseInfos.current,
        ...mouseInfos.velocity
      ]);
      mouseInfos.last = [...mouseInfos.current];
    }

    // Compute fluid
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    dispatchComputePipeline(passEncoder);
    passEncoder.end();

    velocity0.copyTo(velocity, commandEncoder);
    pressure0.copyTo(pressure, commandEncoder);
    dye.copyTo(renderProgram.buffer, commandEncoder);

    // Draw fluid
    renderProgram.dispatch(commandEncoder);

    // Send commands to the GPU
    const gpuCommands = commandEncoder.finish();
    device.queue.submit([gpuCommands]);
  }

  step();
}

main();


const customBtn = document.getElementById('custom-btn');
const customBox = document.getElementById('custom-box');

customBtn.addEventListener('click', () => {
  alert('دکمه شما کلیک شد!');
  customBox.style.background = '#6ee7b7a0'; // نمونه تغییر پس‌زمینه
});

