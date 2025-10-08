import * as THREE from "https://esm.sh/three";
import { Pane } from "https://cdn.skypack.dev/tweakpane@4.0.4";

const createPreloader = () => {
  const container = document.querySelector(".circle-container");
  const progressBar = document.querySelector(".initializing-progress");
  const rings = 5;
  const allDots = [];
  // Create center dot first
  const centerDot = document.createElement("div");
  centerDot.className = "dot";
  centerDot.style.width = "8px";
  centerDot.style.height = "8px";
  centerDot.style.left = "calc(50% - 4px)";
  centerDot.style.top = "calc(50% - 4px)";
  centerDot.style.backgroundColor = "#ffe600";
  centerDot.style.animation = "pulse 1.5s infinite ease-in-out";
  centerDot.style.opacity = "1";
  container.appendChild(centerDot);
  // Create all dots for each ring
  for (let r = 0; r < rings; r++) {
    const radius = 15 + r * 20;
    const numDots = 6 + r * 6;
    // Calculate color based on ring (yellow inner to white outer)
    const yellowAmount = Math.max(0, 1 - r / (rings - 1));
    const colorR = 255;
    const colorG = Math.floor(230 + 25 * (1 - yellowAmount));
    const colorB = Math.floor(0 + 255 * (1 - yellowAmount));
    const color = `rgb(${colorR}, ${colorG}, ${colorB})`;
    // Create dots in this ring
    for (let i = 0; i < numDots; i++) {
      const dot = document.createElement("div");
      dot.className = "dot";
      // Calculate position in a circle
      const angle = (i / numDots) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      // Set dot position and size (larger dots in outer rings)
      const size = 3 + r * 0.8;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.left = `calc(50% + ${x}px - ${size / 2}px)`;
      dot.style.top = `calc(50% + ${y}px - ${size / 2}px)`;
      dot.style.backgroundColor = color;
      // All dots start invisible
      dot.style.opacity = "0";
      container.appendChild(dot);
      allDots.push({
        element: dot,
        ring: r,
        index: i,
        totalInRing: numDots
      });
    }
  }
  // Animation sequence
  const totalAnimationTime = 5000; // 5 seconds total animation
  const progressUpdateInterval = 50; // Update progress every 50ms
  let startTime = Date.now();
  // Start progress bar animation
  const updateProgress = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(100, (elapsed / totalAnimationTime) * 100);
    progressBar.style.width = `${progress}%`;
    if (progress < 100) {
      setTimeout(updateProgress, progressUpdateInterval);
    }
  };
  // Start updating progress
  updateProgress();
  setTimeout(() => {
    // First phase: animate dots appearing from center outward
    let delay = 0;
    const delayIncrement = 20; // ms between dots
    // Sort dots by ring and then by index within ring
    allDots.sort((a, b) => {
      if (a.ring !== b.ring) return a.ring - b.ring;
      return a.index - b.index;
    });
    // Animate each dot with increasing delay
    allDots.forEach((dot, i) => {
      setTimeout(() => {
        dot.element.style.animation = "fadeIn 0.4s forwards ease-out";
      }, delay);
      delay += delayIncrement;
    });
    // Second phase: wait, then reverse the animation
    setTimeout(() => {
      // Hide center dot first
      centerDot.style.animation = "fadeOut 0.4s forwards ease-in";
      // Sort dots in reverse order (outside in)
      allDots.sort((a, b) => {
        if (a.ring !== b.ring) return b.ring - a.ring;
        return a.index - b.index;
      });
      // Animate dots disappearing
      let reverseDelay = 200; // Start after a small pause
      allDots.forEach((dot, i) => {
        setTimeout(() => {
          dot.element.style.animation = "fadeOut 0.4s forwards ease-in";
        }, reverseDelay);
        reverseDelay += delayIncrement;
      });
      // Final phase: complete preloader and show main content
      setTimeout(() => {
        const preloader = document.querySelector(".preloader");
        const mainElements = document.querySelectorAll(
          "#canvas, .particles, #titles-container, footer"
        );
        // Fade in main content
        mainElements.forEach((el) => {
          el.style.opacity = "1";
        });
        // Fade out preloader
        preloader.style.opacity = "0";
        preloader.style.transition =
          "opacity 0.8s cubic-bezier(0.65, 0, 0.35, 1)";
        setTimeout(() => {
          preloader.style.display = "none";
        }, 800);
      }, reverseDelay + 250); // Wait for reverse animation to complete
    }, delay + 750); // Wait for all dots to appear
  }, 750); // Initial delay before starting the sequence
  return allDots;
};
// Run preloader creation immediately
createPreloader();
// Create ambient particles.
const particlesContainer = document.getElementById("particles");
const particleCount = 80;
for (let i = 0; i < particleCount; i++) {
  const particle = document.createElement("div");
  particle.className = "particle";
  const size = Math.random() * 5 + 2;
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  const x = Math.random() * 100;
  const y = Math.random() * 100;
  particle.style.left = `${x}%`;
  particle.style.top = `${y}%`;
  particle.style.opacity = Math.random() * 0.5 + 0.1;
  particlesContainer.appendChild(particle);
}
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
  alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000);
scene.fog = new THREE.FogExp2(0x000, 0.08);
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 5;
// Lights.
const ambientLight = new THREE.AmbientLight(0x404040, 1);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(0, 1, 1);
scene.add(directionalLight);
// --- Slides and Global Settings ---
const slideWidth = 3.2;
const slideHeight = 1.8;
const gap = 0.25;
const slideCount = 10;
const imagesCount = 5;
const totalWidth = slideCount * (slideWidth + gap);
const slideUnit = slideWidth + gap;
/* 
       Global settings:

       - textFadeStart/textFadeEnd: define the range in which the text is visible.
       - textMaxBlur: maximum blur (in pixels).
       - rotationFactor: scales extra rotation ("wobble") from distortions.
       - distortionIntensity: scales overall distortion.
       - horizontalDistortionDamping: reduces the X-axis jitter on small movements.
       
       For demonstration, camera movement amplitude is set to 0 so the scene doesn't "drift".
       If you want a subtle drift, set amplitude > 0 again in updateCamera().
    */
const settings = {
  wheelSensitivity: 0.01,
  touchSensitivity: 0.01,
  momentumMultiplier: 2.5,
  smoothing: 0.1,
  slideLerp: 0.075,
  distortionDecay: 0.93,
  maxDistortion: 4.0,
  distortionSensitivity: 0.25,
  distortionSmoothing: 0.075,
  rotationFactor: 0.2,
  animationSpeed: 0.5,
  textFadeStart: slideWidth / 2, // e.g., 1.6 for slideWidth=3.2
  textFadeEnd: slideWidth / 2 + 0.5,
  textMaxBlur: 5,
  distortionIntensity: 0.3,
  horizontalDistortionDamping: 0.3,
  // Parameters for enhanced momentum distortion
  momentumDistortionBoost: 0.3,
  directionInfluence: 0.4,
  waveAmplitudeBoost: 0.2,
  directionChangeThreshold: 0.02, // Minimum movement needed to change direction
  directionSmoothing: 0.03 // Slower transitions between directions
};
// Setup Tweakpane controls.
const pane = new Pane();
const distortionFolder = pane.addFolder({
  title: "Distortion"
});
distortionFolder.addBinding(settings, "maxDistortion", {
  min: 1.0,
  max: 10.0
});
distortionFolder.addBinding(settings, "distortionSensitivity", {
  min: 0.1,
  max: 1.0
});
distortionFolder.addBinding(settings, "distortionDecay", {
  min: 0.8,
  max: 0.99
});
distortionFolder.addBinding(settings, "distortionSmoothing", {
  min: 0.01,
  max: 0.2
});
distortionFolder.addBinding(settings, "distortionIntensity", {
  min: 0.0,
  max: 1.0
});
distortionFolder.addBinding(settings, "horizontalDistortionDamping", {
  min: 0.0,
  max: 1.0
});
distortionFolder.addBinding(settings, "momentumDistortionBoost", {
  min: 0.0,
  max: 1.0
});
distortionFolder.addBinding(settings, "directionInfluence", {
  min: 0.0,
  max: 1.0
});
distortionFolder.addBinding(settings, "waveAmplitudeBoost", {
  min: 0.0,
  max: 1.0
});
distortionFolder.addBinding(settings, "directionChangeThreshold", {
  min: 0.0,
  max: 0.1
});
distortionFolder.addBinding(settings, "directionSmoothing", {
  min: 0.01,
  max: 0.2
});
const controlsFolder = pane.addFolder({
  title: "Controls"
});
controlsFolder.addBinding(settings, "wheelSensitivity", {
  min: 0.001,
  max: 0.05
});
controlsFolder.addBinding(settings, "touchSensitivity", {
  min: 0.001,
  max: 0.05
});
controlsFolder.addBinding(settings, "momentumMultiplier", {
  min: 0.5,
  max: 5.0
});
const effectsFolder = pane.addFolder({
  title: "Effects"
});
effectsFolder.addBinding(settings, "rotationFactor", {
  min: 0.0,
  max: 0.5
});
effectsFolder.addBinding(settings, "animationSpeed", {
  min: 0.1,
  max: 2.0
});
effectsFolder.addBinding(settings, "textFadeStart", {
  min: 0.0,
  max: 5.0
});
effectsFolder.addBinding(settings, "textFadeEnd", {
  min: 0.0,
  max: 5.0
});
effectsFolder.addBinding(settings, "textMaxBlur", {
  min: 0,
  max: 20
});
distortionFolder.expanded = false;
controlsFolder.expanded = false;
effectsFolder.expanded = false;
// --- Slides and Titles Initialization ---
const slides = [];
let currentPosition = 0;
let targetPosition = 0;
let isScrolling = false;
let autoScrollSpeed = 0;
let lastTime = 0;
let touchStartX = 0;
let touchLastX = 0;
let globalTime = 0;
let currentDistortionFactor = 0;
let targetDistortionFactor = 0;
let peakVelocity = 0;
let velocityHistory = [0, 0, 0, 0, 0];
let lastDeltaX = 0;
let movementDirection = new THREE.Vector2(0, 0);
let lastMovementInput = 0;
let accumulatedMovement = 0;
// White light instead of colored
const pointLight = new THREE.PointLight(0xffffff, 2, 10);
pointLight.position.set(0, 0, 2);
scene.add(pointLight);
window.addEventListener("mousemove", (e) => {
  const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  const mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  pointLight.position.x = mouseX * 3;
  pointLight.position.y = mouseY * 2;
});
const imageUrls = [
  "https://cdn.cosmos.so/2f49a117-05e7-4ae9-9e95-b9917f970adb?format=jpeg",
  "https://cdn.cosmos.so/7b5340f5-b4dc-4c08-8495-c507fa81480b?format=jpeg",
  "https://cdn.cosmos.so/f733585a-081e-48e7-a30e-e636446f2168?format=jpeg",
  "https://cdn.cosmos.so/47caf8a0-f456-41c5-98ea-6d0476315731?format=jpeg",
  "https://cdn.cosmos.so/f99f8445-6a19-4a9a-9de3-ac382acc1a3f?format=jpeg"
];
const imageTitles = [
  {
    title: "COSMIC VOYAGE",
    offset: {
      x: 0,
      y: -25
    }
  },
  {
    title: "ASTRAL NEBULA",
    offset: {
      x: 0,
      y: 30
    }
  },
  {
    title: "STELLAR DRIFT",
    offset: {
      x: 0,
      y: 20
    }
  },
  {
    title: "ORBITAL PATH",
    offset: {
      x: 0,
      y: -20
    }
  },
  {
    title: "CELESTIAL FLOW",
    offset: {
      x: 0,
      y: -15
    }
  }
];
const titlesContainer = document.getElementById("titles-container");
const titleElements = [];
for (let i = 0; i < slideCount; i++) {
  const imageIndex = i % imagesCount;
  const titleInfo = imageTitles[imageIndex];
  const titleEl = document.createElement("div");
  titleEl.className = "slide-title";
  const titleText = document.createElement("h2");
  titleText.className = "title-text";
  titleText.textContent = titleInfo.title;
  const titleNumber = document.createElement("p");
  titleNumber.className = "title-number";
  titleNumber.textContent = `0${i + 1}`;
  titleEl.appendChild(titleText);
  titleEl.appendChild(titleNumber);
  titleEl.style.opacity = "0";
  titleEl.style.filter = "blur(0px)";
  titlesContainer.appendChild(titleEl);
  titleElements.push({
    element: titleEl,
    offset: titleInfo.offset,
    index: i
  });
}
const correctImageColor = (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};
const createSlide = (index) => {
  const geometry = new THREE.PlaneGeometry(slideWidth, slideHeight, 64, 32);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    metalness: 0.2,
    roughness: 0.8,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = index * (slideWidth + gap);
  mesh.userData = {
    originalVertices: [...geometry.attributes.position.array],
    index,
    time: Math.random() * 1000,
    waveSpeed: 0.5 + Math.random() * 0.5,
    waveAmplitude: 1.0,
    wavePhase: Math.random() * Math.PI * 2
  };
  const imageIndex = index % imagesCount;
  const imagePath = imageUrls[imageIndex];
  new THREE.TextureLoader().load(
    imagePath,
    (texture) => {
      correctImageColor(texture);
      material.map = texture;
      material.needsUpdate = true;
      const imgAspect = texture.image.width / texture.image.height;
      const slideAspect = slideWidth / slideHeight;
      if (imgAspect > slideAspect) {
        mesh.scale.y = slideAspect / imgAspect;
      } else {
        mesh.scale.x = imgAspect / slideAspect;
      }
    },
    undefined,
    (err) => console.warn(`Couldn't load image ${imagePath}`, err)
  );
  scene.add(mesh);
  slides.push(mesh);
};
for (let i = 0; i < slideCount; i++) {
  createSlide(i);
}
slides.forEach((slide) => {
  slide.position.x -= totalWidth / 2;
  slide.userData.targetX = slide.position.x;
  slide.userData.currentX = slide.position.x;
  // Slight random rotation just for style.
  slide.rotation.x = (Math.random() - 0.5) * 0.1;
  slide.rotation.y = (Math.random() - 0.5) * 0.1;
});
// Updated title positions to keep text horizontally centered over each image.
const updateTitlePositions = () => {
  titleElements.forEach((titleObj) => {
    const slide = slides[titleObj.index];
    const { element, offset } = titleObj;
    // Project the slide's position into screen coords.
    const vector = new THREE.Vector3(
      slide.position.x,
      slide.position.y,
      slide.position.z
    );
    vector.project(camera);
    const screenX = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-vector.y * 0.5 + 0.5) * window.innerHeight;
    // Place text exactly horizontally centered, and apply only vertical offset.
    // After setting, measure text width and recenter horizontally.
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY + offset.y}px`;
    const textRect = element.getBoundingClientRect();
    element.style.left = `${screenX - textRect.width / 2}px`;
    // Fade + blur based on world distance from center.
    const distanceFromCenter = Math.abs(slide.position.x);
    let opacity;
    if (distanceFromCenter < settings.textFadeStart) {
      opacity = 1;
    } else if (distanceFromCenter > settings.textFadeEnd) {
      opacity = 0;
    } else {
      opacity =
        1 -
        (distanceFromCenter - settings.textFadeStart) /
          (settings.textFadeEnd - settings.textFadeStart);
    }
    element.style.opacity = opacity.toFixed(2);
    // Compute blur: maximum at opacity=0
    const blurValue = (1 - opacity) * settings.textMaxBlur;
    element.style.filter = `blur(${blurValue}px)`;
  });
};
// Enhanced distortion with smoother momentum and directional influence
const updateDistortion = (mesh, distortionFactor, deltaTime) => {
  mesh.userData.time +=
    deltaTime * settings.animationSpeed * mesh.userData.waveSpeed;
  const time = mesh.userData.time;
  const positionAttribute = mesh.geometry.attributes.position;
  const originalVertices = mesh.userData.originalVertices;
  // Enhanced wave amplitude based on momentum (with more gradual changes)
  const momentumBoost = Math.min(
    1.0,
    peakVelocity * settings.momentumDistortionBoost
  );
  // More gradual wave amplitude changes
  const targetWaveAmplitude =
    1.0 + momentumBoost * settings.waveAmplitudeBoost * 3.0;
  mesh.userData.waveAmplitude = mesh.userData.waveAmplitude || 1.0;
  mesh.userData.waveAmplitude +=
    (targetWaveAmplitude - mesh.userData.waveAmplitude) * 0.05;
  const effectiveDistortion = distortionFactor * settings.distortionIntensity;
  const gravityCenterX = Math.sin(time * 0.1) * 0.5;
  const gravityCenterY = Math.cos(time * 0.15) * 0.3;
  const gravityStrength = Math.min(2.0, Math.max(0, effectiveDistortion)) * 2.0;
  const dx = mesh.userData.targetX - mesh.userData.currentX;
  const dxAbs = Math.abs(dx);
  // Only update direction if movement exceeds threshold
  if (dxAbs > settings.directionChangeThreshold) {
    // Get movement sign
    const newDirection = dx > 0 ? -1 : 1;
    // Apply much smoother directional changes
    const directionBlend = Math.min(
      1.0,
      settings.directionSmoothing * (1 + dxAbs * 5)
    );
    movementDirection.x +=
      (newDirection - movementDirection.x) * directionBlend;
  }
  // Scale direction influence by velocity to reduce effect of small movements
  const velocityScale = Math.min(1.0, peakVelocity * 2);
  const effectiveDirectionInfluence =
    settings.directionInfluence * velocityScale;
  for (let i = 0; i < positionAttribute.count; i++) {
    const x = originalVertices[i * 3];
    const y = originalVertices[i * 3 + 1];
    const z = originalVertices[i * 3 + 2];
    const distX = x - gravityCenterX;
    const distY = y - gravityCenterY;
    const dist = Math.sqrt(distX * distX + distY * distY + 0.0001);
    const gravityFactor = Math.min(1, 1 / (1 + dist * 8));
    // Smoother directional wave with velocity scaling
    const dirWaveX =
      movementDirection.x *
      Math.sin(dist * 5 + time) *
      effectiveDirectionInfluence;
    // Keep Y wave minimal to prevent vertical jumpiness
    const dirWaveY =
      movementDirection.y *
      Math.cos(dist * 5 + time) *
      (effectiveDirectionInfluence * 0.3);
    // Distortion components
    const pullX = distX * gravityFactor * gravityStrength * 0.5;
    const pullY = distY * gravityFactor * gravityStrength * 0.5;
    // Reduce stretch effect for small movements
    const stretchFactor = effectiveDistortion * 0.3 * velocityScale;
    const stretchX =
      movementDirection.x * stretchFactor * (1 - Math.min(1, Math.abs(y)));
    const stretchY =
      movementDirection.y * stretchFactor * (1 - Math.min(1, Math.abs(x)));
    // Enhanced wave effect that scales with momentum
    const waveScale = mesh.userData.waveAmplitude;
    const phase = mesh.userData.wavePhase;
    const pulse =
      Math.sin(time + dist * 3 + phase) *
      0.05 *
      effectiveDistortion *
      waveScale;
    const twistAmount =
      effectiveDistortion * 0.1 * gravityFactor * velocityScale;
    const twistX = -y * twistAmount;
    const twistY = x * twistAmount;
    // Apply extra horizontal damping for small movements
    const horizontalDamping =
      settings.horizontalDistortionDamping * (1 - velocityScale * 0.3);
    // Apply displacement with more aggressive damping at low velocities
    const newX =
      x +
      Math.min(
        1,
        Math.max(-1, (pullX + stretchX + twistX + dirWaveX) * horizontalDamping)
      );
    const newY =
      y + Math.min(1, Math.max(-1, pullY + stretchY + twistY + dirWaveY));
    const newZ = Math.min(
      2,
      Math.max(
        -2,
        (gravityFactor * gravityStrength + pulse) * (1 + Math.min(5, dist))
      )
    );
    positionAttribute.setXYZ(i, newX, newY, newZ);
  }
  positionAttribute.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  // More gradual rotation changes
  const targetRotFactor =
    Math.min(0.2, effectiveDistortion) *
    settings.rotationFactor *
    (1 + momentumBoost * 0.5);
  mesh.userData.currentRotFactor = mesh.userData.currentRotFactor || 0;
  mesh.userData.currentRotFactor +=
    (targetRotFactor - mesh.userData.currentRotFactor) * 0.1;
  const rotFactor = mesh.userData.currentRotFactor;
  mesh.rotation.x = Math.sin(time * 0.2) * 0.1 * rotFactor;
  mesh.rotation.y = Math.sin(time * 0.3 + 0.5) * 0.1 * rotFactor;
  mesh.rotation.z = rotFactor * 0.05 * Math.sin(time * 0.1);
};
// Drag and scroll functionality.
let isDragging = false;
let dragStartX = 0;
let dragLastX = 0;
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  dragStartX = e.clientX;
  dragLastX = dragStartX;
  canvas.style.cursor = "grabbing";
  // Removed brightness/contrast filter
});
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const mouseX = e.clientX;
  const deltaX = mouseX - dragLastX;
  lastDeltaX = deltaX; // Store for movement direction
  // Accumulate small movements to avoid jerkiness
  accumulatedMovement += deltaX;
  // Only apply movement if it exceeds threshold or time has passed
  const now = performance.now();
  const timeDelta = now - lastMovementInput;
  if (Math.abs(accumulatedMovement) > 1 || timeDelta > 50) {
    dragLastX = mouseX;
    const dragStrength = Math.abs(accumulatedMovement) * 0.02;
    targetDistortionFactor = Math.min(
      1.0,
      targetDistortionFactor + dragStrength
    );
    targetPosition -= accumulatedMovement * settings.touchSensitivity;
    accumulatedMovement = 0;
    lastMovementInput = now;
  }
});
window.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  canvas.style.cursor = "grab";
  // Removed filter reset
  const velocity = (dragLastX - dragStartX) * 0.005;
  if (Math.abs(velocity) > 0.5) {
    autoScrollSpeed = -velocity * settings.momentumMultiplier * 0.05;
    targetDistortionFactor = Math.min(
      1.0,
      Math.abs(velocity) * 3 * settings.distortionSensitivity
    );
    isScrolling = true;
    setTimeout(() => {
      isScrolling = false;
    }, 800);
  }
});
window.addEventListener("mouseleave", () => {
  if (isDragging) {
    isDragging = false;
    canvas.style.cursor = "grab";
    // Removed filter reset
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") {
    targetPosition += slideUnit;
    targetDistortionFactor = Math.min(1.0, targetDistortionFactor + 0.4);
    movementDirection.x = 1; // Set direction for left
  } else if (e.key === "ArrowRight") {
    targetPosition -= slideUnit;
    targetDistortionFactor = Math.min(1.0, targetDistortionFactor + 0.4);
    movementDirection.x = -1; // Set direction for right
  }
});
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const wheelStrength = Math.abs(e.deltaY) * 0.001;
    targetDistortionFactor = Math.min(
      1.0,
      targetDistortionFactor + wheelStrength
    );
    targetPosition -= e.deltaY * settings.wheelSensitivity;
    isScrolling = true;
    autoScrollSpeed =
      Math.min(Math.abs(e.deltaY) * 0.0005, 0.05) * Math.sign(e.deltaY);
    movementDirection.x = Math.sign(e.deltaY) * -1; // Set direction for wheel
    clearTimeout(window.scrollTimeout);
    window.scrollTimeout = setTimeout(() => {
      isScrolling = false;
    }, 150);
  },
  {
    passive: false
  }
);
window.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.touches[0].clientX;
    touchLastX = touchStartX;
    isScrolling = false;
  },
  {
    passive: false
  }
);
window.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touchX = e.touches[0].clientX;
    const deltaX = touchX - touchLastX;
    lastDeltaX = deltaX; // Store for movement direction
    // Accumulate small movements to avoid jerkiness
    accumulatedMovement += deltaX;
    // Only apply movement if it exceeds threshold or time has passed
    const now = performance.now();
    const timeDelta = now - lastMovementInput;
    if (Math.abs(accumulatedMovement) > 1 || timeDelta > 50) {
      touchLastX = touchX;
      const touchStrength = Math.abs(accumulatedMovement) * 0.02;
      targetDistortionFactor = Math.min(
        1.0,
        targetDistortionFactor + touchStrength
      );
      targetPosition -= accumulatedMovement * settings.touchSensitivity;
      accumulatedMovement = 0;
      lastMovementInput = now;
      isScrolling = true;
    }
  },
  {
    passive: false
  }
);
window.addEventListener("touchend", () => {
  const velocity = (touchLastX - touchStartX) * 0.005;
  if (Math.abs(velocity) > 0.5) {
    autoScrollSpeed = -velocity * settings.momentumMultiplier * 0.05;
    targetDistortionFactor = Math.min(
      1.0,
      Math.abs(velocity) * 3 * settings.distortionSensitivity
    );
    movementDirection.x = Math.sign(velocity) * -1; // Set direction from velocity
    isScrolling = true;
    setTimeout(() => {
      isScrolling = false;
    }, 800);
  }
});
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateTitlePositions();
});
// Subtle camera movement is now disabled. Set amplitude > 0 if you want drift.
const updateCamera = (time) => {
  const amplitude = 0; // <--- camera drift disabled
  const frequency = 0.2;
  camera.position.y = Math.sin(time * frequency) * amplitude;
  camera.position.x = Math.cos(time * frequency * 0.7) * amplitude * 0.5;
  camera.lookAt(0, 0, 0);
};
const animate = (time) => {
  requestAnimationFrame(animate);
  const deltaTime = lastTime ? (time - lastTime) / 1000 : 0.016;
  lastTime = time;
  globalTime += deltaTime;
  // Removed color change and set to constant white light
  pointLight.color.set(0xffffff);
  const prevPos = currentPosition;
  if (isScrolling) {
    targetPosition += autoScrollSpeed;
    const speedBasedDecay = 0.97 - Math.abs(autoScrollSpeed) * 0.5;
    autoScrollSpeed *= Math.max(0.92, speedBasedDecay);
    if (Math.abs(autoScrollSpeed) < 0.001) {
      autoScrollSpeed = 0;
    }
  }
  // Smoother position updates with adaptive smoothing
  // Use less smoothing for larger movements to maintain responsiveness
  // Use more smoothing for small movements to prevent jitter
  const positionDelta = Math.abs(targetPosition - currentPosition);
  const adaptiveSmoothing =
    settings.smoothing * (positionDelta < 0.1 ? 0.5 : 1.0);
  currentPosition += (targetPosition - currentPosition) * adaptiveSmoothing;
  // Compute current velocity in slides with improved tracking
  const currentVelocity = Math.abs(currentPosition - prevPos) / deltaTime;
  // More stable velocity calculation with threshold filtering
  // Filter out tiny movements that could cause jitter
  const significantVelocity = currentVelocity > 0.01 ? currentVelocity : 0;
  velocityHistory.push(significantVelocity);
  velocityHistory.shift();
  // Use weighted average with more weight on recent values
  const weights = [0.1, 0.15, 0.2, 0.25, 0.3]; // More weight on recent values
  let weightSum = 0;
  let weightedVelocity = 0;
  for (let i = 0; i < velocityHistory.length; i++) {
    weightedVelocity += velocityHistory[i] * weights[i];
    weightSum += weights[i];
  }
  const avgVelocity = weightSum > 0 ? weightedVelocity / weightSum : 0;
  // Smoother peak velocity updates
  if (avgVelocity > peakVelocity) {
    // Gradual increase to peak
    peakVelocity += (avgVelocity - peakVelocity) * 0.3;
    // Boost distortion on acceleration more smoothly
    const accelerationBoost = Math.min(0.1, avgVelocity * 0.03);
    targetDistortionFactor = Math.min(
      settings.maxDistortion,
      targetDistortionFactor + accelerationBoost
    );
  }
  const velocityRatio = avgVelocity / (peakVelocity + 0.001);
  const isDecelerating = velocityRatio < 0.7 && peakVelocity > 0.3;
  // More gradual peak velocity decay for smoother transitions
  peakVelocity *= 0.98;
  // Scale movement distortion by square of velocity to reduce impact of small moves
  const movementDistortion = Math.min(
    1.0,
    currentVelocity * currentVelocity * 2
  );
  if (currentVelocity > 0.03) {
    // More gradual increase
    const blendFactor = Math.min(0.2, currentVelocity);
    targetDistortionFactor +=
      (movementDistortion - targetDistortionFactor) * blendFactor;
  }
  // Different decay rates for acceleration vs deceleration
  if (isDecelerating) {
    // Slower decay when decelerating for more lasting effect
    targetDistortionFactor *= settings.distortionDecay * 1.01;
  } else if (avgVelocity < 0.1) {
    // Faster decay when nearly stopped
    targetDistortionFactor *= settings.distortionDecay * 0.9;
  }
  // Adaptive smoothing based on distortion magnitude
  // More smoothing for small changes to reduce jitter
  const distortionDelta = Math.abs(
    targetDistortionFactor - currentDistortionFactor
  );
  const adaptiveDistortionSmoothing =
    settings.distortionSmoothing * (distortionDelta < 0.05 ? 0.5 : 1.0);
  currentDistortionFactor +=
    (targetDistortionFactor - currentDistortionFactor) *
    adaptiveDistortionSmoothing;
  updateCamera(globalTime);
  slides.forEach((slide, i) => {
    let baseX = i * slideUnit - currentPosition;
    baseX = ((baseX % totalWidth) + totalWidth) % totalWidth;
    if (baseX > totalWidth / 2) {
      baseX -= totalWidth;
    }
    if (Math.abs(baseX - slide.userData.targetX) > slideWidth * 2) {
      slide.userData.currentX = baseX;
    }
    slide.userData.targetX = baseX;
    slide.userData.currentX +=
      (slide.userData.targetX - slide.userData.currentX) * settings.slideLerp;
    if (Math.abs(slide.userData.currentX) < totalWidth / 2 + slideWidth * 1.5) {
      slide.position.x = slide.userData.currentX;
      const distanceFromCenter = Math.abs(slide.position.x);
      // We do a subtle Z offset so slides off-center recede slightly
      slide.position.z = distanceFromCenter * -0.05;
      updateDistortion(slide, currentDistortionFactor, deltaTime);
    }
  });
  updateTitlePositions();
  renderer.render(scene, camera);
};
animate();

