// The particles of a picture that breaks into dust, as a share of the time of the effect.

// The edge of a particle, in CSS px.
export const PARTICLE_SIZE = 2;

// The time in which the particles leave, from the left edge to the right edge.
export const STAGGER = 0.45;

// The time from the leave of a particle to its end.
export const LIFE = 0.55;

// The share of its life after which a particle starts to fade.
const FADE_START = 0.3;

// The opacity at or below which a square of the picture makes no particle.
const ALPHA_MIN = 25;

// One particle for each square of PARTICLE_SIZE px of `image` (an ImageData) that is not
// transparent. A particle leaves later when it is more to the right, and goes up and to the right.
export const makeParticles = ({ data, width, height }, random = Math.random) => {
  const particles = [];
  for (let y = 0; y < height; y += PARTICLE_SIZE) {
    for (let x = 0; x < width; x += PARTICLE_SIZE) {
      const i = (y * width + x) * 4;
      if (data[i + 3] <= ALPHA_MIN) continue;
      particles.push({
        x,
        y,
        color: `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})`,
        alpha: data[i + 3] / 255,
        delay: STAGGER * (0.75 * (x / width) + 0.25 * random()),
        dx: 20 + 50 * random(),
        dy: -(15 + 45 * random()),
      });
    }
  }
  return particles;
};

// The place and the opacity of `particle` at the time `t`, from 0 to 1. The particle speeds up as
// it goes, and fades out in the last part of its life.
export const particleAt = (particle, t) => {
  const life = Math.min(1, Math.max(0, (t - particle.delay) / LIFE));
  const way = life * life;
  const fade = Math.max(0, (life - FADE_START) / (1 - FADE_START));
  return {
    x: particle.x + particle.dx * way,
    y: particle.y + particle.dy * way,
    alpha: particle.alpha * (1 - fade),
  };
};
