import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, isLast, shouldShow, step, textParts } from '#onboarding';

test('PAGES has the two pages in their order, each one time', () => {
  assert.deepEqual(PAGES, ['welcome', 'offline']);
  assert.equal(new Set(PAGES).size, PAGES.length);
});

test('shouldShow is true for no flag and no stored state', () => {
  assert.equal(shouldShow({ seen: false, hasState: false }), true);
});

test('shouldShow is false for a stored state', () => {
  assert.equal(shouldShow({ seen: false, hasState: true }), false);
});

test('shouldShow is false after the walkthrough was seen', () => {
  assert.equal(shouldShow({ seen: true, hasState: false }), false);
  assert.equal(shouldShow({ seen: true, hasState: true }), false);
});

test('step goes one page forward and one page back', () => {
  assert.equal(step(0, 1), 1);
  assert.equal(step(1, -1), 0);
});

test('step stays on the page for no direction', () => {
  assert.equal(step(1, 0), 1);
});

test('step does not go past the first and the last page', () => {
  assert.equal(step(0, -1), 0);
  assert.equal(step(PAGES.length - 1, 1), PAGES.length - 1);
});

test('isLast is true for the last page only', () => {
  assert.equal(isLast(PAGES.length - 1), true);
  assert.equal(isLast(0), false);
  assert.equal(isLast(PAGES.length - 2), false);
});

test('textParts marks the text between backticks as a key', () => {
  assert.deepEqual(textParts('Toca `↻` en lo de siempre.'), [
    { text: 'Toca ', key: false },
    { text: '↻', key: true },
    { text: ' en lo de siempre.', key: false },
  ]);
});

test('textParts gives one plain part for a text with no backtick', () => {
  assert.deepEqual(textParts('Desliza la pantalla.'), [{ text: 'Desliza la pantalla.', key: false }]);
});

test('textParts reads keys at the start and at the end, and leaves out empty parts', () => {
  assert.deepEqual(textParts('`+` y `↻`'), [
    { text: '+', key: true },
    { text: ' y ', key: false },
    { text: '↻', key: true },
  ]);
});

test('textParts keeps a backtick with no pair as text', () => {
  assert.deepEqual(textParts('Abre `menú'), [{ text: 'Abre `menú', key: false }]);
  assert.deepEqual(textParts('`+` y `fin'), [
    { text: '+', key: true },
    { text: ' y `fin', key: false },
  ]);
});

test('textParts reads an icon of the sprite at the start of a key, with or without text', () => {
  assert.deepEqual(textParts('Con `#cart-add`. En `#menu Menú` planificas.'), [
    { text: 'Con ', key: false },
    { text: '', key: true, icon: 'cart-add' },
    { text: '. En ', key: false },
    { text: 'Menú', key: true, icon: 'menu' },
    { text: ' planificas.', key: false },
  ]);
});

test('textParts reads a # that is not at the start of a key, or a lone #, as text', () => {
  assert.deepEqual(textParts('`a #menu` y `#`'), [
    { text: 'a #menu', key: true },
    { text: ' y ', key: false },
    { text: '#', key: true },
  ]);
});

test('textParts marks the text between two ** as bold', () => {
  assert.deepEqual(textParts('**Borrar todos los datos** en Ajustes.'), [
    { text: 'Borrar todos los datos', key: false, strong: true },
    { text: ' en Ajustes.', key: false },
  ]);
});

test('textParts reads a key beside bold text and a key inside it', () => {
  assert.deepEqual(textParts('**Toca `↻`** y `+`.'), [
    { text: 'Toca ', key: false, strong: true },
    { text: '↻', key: true, strong: true },
    { text: ' y ', key: false },
    { text: '+', key: true },
    { text: '.', key: false },
  ]);
  assert.deepEqual(textParts('`Ajustes` › **Ayuda**'), [
    { text: 'Ajustes', key: true },
    { text: ' › ', key: false },
    { text: 'Ayuda', key: false, strong: true },
  ]);
});

test('textParts keeps a ** with no pair, and a ** inside a key, as text', () => {
  assert.deepEqual(textParts('Abre **menú'), [{ text: 'Abre **menú', key: false }]);
  assert.deepEqual(textParts('**a** y **b'), [
    { text: 'a', key: false, strong: true },
    { text: ' y **b', key: false },
  ]);
  assert.deepEqual(textParts('Pulsa `**`.'), [
    { text: 'Pulsa ', key: false },
    { text: '**', key: true },
    { text: '.', key: false },
  ]);
});
