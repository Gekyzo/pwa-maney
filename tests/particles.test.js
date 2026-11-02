import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFE, PARTICLE_SIZE, STAGGER, makeParticles, particleAt } from '#particles';

// A picture of `width` x `height` px, opaque where `on(x, y)` is true.
const picture = (width, height, on, rgb = [10, 20, 30]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!on(x, y)) continue;
      data.set([...rgb, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
};

const fixed = (value) => () => value;

test('makeParticles makes one particle for each opaque square of PARTICLE_SIZE px', () => {
  const particles = makeParticles(picture(8, 4, () => true), fixed(0.5));
  assert.equal(particles.length, (8 / PARTICLE_SIZE) * (4 / PARTICLE_SIZE));
  assert.deepEqual(particles.slice(0, 2).map(({ x, y }) => [x, y]), [[0, 0], [PARTICLE_SIZE, 0]]);
});

test('makeParticles skips a square that is transparent or almost transparent', () => {
  const image = picture(4, 2, (x) => x < 2);
  image.data[(0 * 4 + 2) * 4 + 3] = 20;
  assert.equal(makeParticles(image, fixed(0.5)).length, 1);
});

test('makeParticles takes the colour and the opacity of the square', () => {
  const image = picture(2, 2, () => true, [200, 100, 50]);
  image.data[3] = 128;
  const [particle] = makeParticles(image, fixed(0.5));
  assert.equal(particle.color, 'rgb(200 100 50)');
  assert.equal(particle.alpha, 128 / 255);
});

test('makeParticles releases the left of the picture first, in the time of STAGGER', () => {
  const particles = makeParticles(picture(20, 2, () => true), fixed(0));
  const delays = particles.map((particle) => particle.delay);
  assert.deepEqual(delays, [...delays].sort((a, b) => a - b));
  assert.equal(delays[0], 0);
  for (const particle of makeParticles(picture(20, 2, () => true), fixed(1))) {
    assert.ok(particle.delay >= 0 && particle.delay <= STAGGER, particle.delay);
  }
});

test('makeParticles sends each particle up and to the right', () => {
  for (const random of [fixed(0), fixed(0.5), fixed(1)]) {
    const [particle] = makeParticles(picture(2, 2, () => true), random);
    assert.ok(particle.dx > 0, `dx ${particle.dx}`);
    assert.ok(particle.dy < 0, `dy ${particle.dy}`);
  }
});

test('makeParticles of an empty picture is empty', () => {
  assert.deepEqual(makeParticles(picture(0, 0, () => true), fixed(0.5)), []);
  assert.deepEqual(makeParticles(picture(4, 4, () => false), fixed(0.5)), []);
});

const particle = { x: 4, y: 6, dx: 40, dy: -30, delay: 0.2, alpha: 1, color: 'rgb(0 0 0)' };

test('particleAt keeps a particle in its place, opaque, before its delay', () => {
  assert.deepEqual(particleAt(particle, 0), { x: 4, y: 6, alpha: 1 });
  assert.deepEqual(particleAt(particle, 0.2), { x: 4, y: 6, alpha: 1 });
});

test('particleAt moves the particle by dx, dy and fades it out at the end of its life', () => {
  const end = particleAt(particle, 0.2 + LIFE);
  assert.equal(Math.round(end.x), 44);
  assert.equal(Math.round(end.y), -24);
  assert.equal(end.alpha, 0);
  assert.deepEqual(particleAt(particle, 1), end);
});

test('particleAt moves the particle away from its place on the way', () => {
  const half = particleAt(particle, 0.2 + LIFE / 2);
  assert.ok(half.x > 4 && half.x < 44, half.x);
  assert.ok(half.y < 6 && half.y > -24, half.y);
  assert.ok(half.alpha > 0, half.alpha);
});

test('the last particle ends its life at the end of the time', () => {
  assert.ok(STAGGER + LIFE <= 1);
});
