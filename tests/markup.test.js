import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGS } from '#i18n';
import { PAGES } from '#onboarding';
import { SECTIONS } from '#sections';
import { MODULES } from '#modules';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const body = html.slice(html.indexOf('<body'), html.indexOf('<script type="importmap">'));

const textKeys = [...body.matchAll(/data-i18n="([^"]+)"/g)].map(([, key]) => key);
const attrKeys = [...body.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(([, pairs]) =>
  pairs.split(',').map((pair) => pair.split(':')[1]));

test('the page has translated text and translated attributes', () => {
  assert.ok(textKeys.length > 0);
  assert.ok(attrKeys.length > 0);
});

test('each key of the page is in the Spanish catalog', () => {
  for (const key of [...textKeys, ...attrKeys]) assert.ok(Object.hasOwn(CATALOGS.es, key), key);
});

test('an element with a text key is empty in the markup', () => {
  for (const [, key, text] of body.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(text.trim(), '', key);
});

test('the markup has no text of its own', () => {
  const visible = body
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<span class="chevron"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[+\s]/g, '');
  assert.equal(visible, '');
  assert.doesNotMatch(body, /\s(aria-label|placeholder|title)="/);
});

test('the to-do sheet has a veil, a dialog, a text field of at most 500 characters and an optional date (TODO-10)', () => {
  const [layer = ''] = body.match(/<div id="todo-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/) ?? [];
  assert.match(layer, /<div id="todo-veil" class="sheet-veil">/);
  assert.match(layer, /<form id="todo-form" class="sheet" role="dialog"/);
  assert.match(layer, /<textarea id="todo-text"[^>]*maxlength="500"/);
  const [date = ''] = layer.match(/<input id="todo-due"[^>]*>/) ?? [];
  assert.match(date, /type="date"/);
  assert.doesNotMatch(date, /required/);
});

test('the to-do sheet has a head with its title and Close, a body, and Save in its foot', () => {
  const [layer = ''] = body.match(/<div id="todo-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/) ?? [];
  assert.match(layer, /<header class="sheet-head"><h2 id="todo-sheet-title" class="sheet-title main"><\/h2><button id="todo-close" class="button tonal" type="button" data-i18n="todos.close"><\/button><\/header>\s*<div class="sheet-body">/);
  assert.match(layer, /<footer class="sheet-foot"><button class="button primary wide" type="submit" data-i18n="todos.save"><\/button><\/footer>\s*<\/form>/);
});

const receiptSheet = body.match(/<div id="receipt-sheet" class="sheet-layer"[\s\S]*?<\/form>\s*<\/div>/)?.[0] ?? '';

test('the receipt sheet has a date, an amount with its error line, a shop of 120 and a note of 500 characters (REC-6)', () => {
  assert.match(receiptSheet, /<div id="receipt-veil" class="sheet-veil">/);
  assert.match(receiptSheet, /<form id="receipt-form" class="sheet" role="dialog" aria-modal="true" aria-labelledby="receipt-sheet-title"[^>]*novalidate/);
  assert.match(receiptSheet, /<input id="receipt-taken" class="input field-input" type="date"/);
  const [amount = ''] = receiptSheet.match(/<input id="receipt-amount"[^>]*>/) ?? [];
  assert.match(amount, /type="text"/);
  assert.match(amount, /inputmode="decimal"/);
  assert.match(amount, /aria-describedby="receipt-amount-error"/);
  assert.match(receiptSheet, /<p id="receipt-amount-error" class="input-help danger" data-i18n="error.amountInvalid" hidden><\/p>/);
  assert.match(receiptSheet, /<input id="receipt-shop"[^>]*maxlength="120"/);
  assert.match(receiptSheet, /<textarea id="receipt-note"[^>]*maxlength="500"/);
});

test('the receipt sheet has a head with its title and Close, the empty photo slot, and Save in its foot (REC-6)', () => {
  assert.match(receiptSheet, /<header class="sheet-head"><h2 id="receipt-sheet-title" class="sheet-title main"><\/h2><button id="receipt-close" class="button tonal" type="button" data-i18n="receipts.close"><\/button><\/header>\s*<div class="sheet-body">/);
  assert.match(receiptSheet, /<figure id="receipt-photo" class="receipt-photo" hidden><img id="receipt-photo-img" class="receipt-photo-img" alt=""><button id="receipt-photo-button" class="button tonal" type="button"><\/button><\/figure>/);
  assert.match(receiptSheet, /<footer class="sheet-foot"><button class="button primary wide" type="submit" data-i18n="receipts.save"><\/button><\/footer>\s*<\/form>/);
});

test('the Receipts section has its list and an empty state with Add receipt (REC-5)', () => {
  const [section = ''] = body.match(/<section id="receipts"[\s\S]*?<\/section>/) ?? [];
  assert.match(section, /<ul id="receipt-list" class="item-list"><\/ul>/);
  assert.match(section, /<p data-i18n="receipts.empty"><\/p>\s*<button id="receipts-add" class="button primary" type="button" data-i18n="receipts.add"><\/button>/);
});

test('the Summary section has the empty text and the four counts, and no control (SUM-3)', () => {
  const [section = ''] = body.match(/<section id="summary"[\s\S]*?<\/section>/) ?? [];
  assert.match(section, /<p id="summary-empty" class="empty-state inline" data-i18n="summary.empty" hidden><\/p>/);
  const counts = [...section.matchAll(/data-i18n="summary\.status\.(\w+)"/g)].map(([, name]) => name);
  assert.deepEqual(counts, ['ok', 'review', 'missing', 'pending']);
  for (const name of counts) assert.match(section, new RegExp(`<dd id="summary-${name}" class="summary-count-value"></dd>`), name);
  assert.doesNotMatch(section, /<(button|input|select|textarea)\b/);
});

test('the page has one section and one navigation item for each section, in the order of SECTIONS (NAV-1)', () => {
  const items = [...body.matchAll(/<button class="nav-item" type="button" data-view="([\w-]+)">/g)].map(([, view]) => view);
  assert.deepEqual(items, SECTIONS);
  for (const view of SECTIONS) assert.match(body, new RegExp(`<section id="${view}"`), view);
});

test('Modules in Settings has one switch for each module (MOD-1)', () => {
  const boxes = [...body.matchAll(/data-module="([\w-]+)"/g)].map(([, id]) => id);
  assert.deepEqual(boxes, MODULES);
});

test('the walkthrough has one drawing for each page, in the order of the pages', () => {
  const [layer = ''] = body.match(/<div id="onboarding"[\s\S]*?<input id="import-file"/) ?? [];
  const drawings = [...layer.matchAll(/<svg data-page="([^"]+)"/g)].map(([, page]) => page);
  assert.deepEqual(drawings, PAGES);
});

test('the walkthrough shows the app icon first, out of the page that changes, with no text', () => {
  const [, layer = ''] = body.match(/<div id="onboarding"[^>]*>\s*([\s\S]*?)<div id="onboarding-page"/) ?? [];
  assert.match(layer, /^<img class="onboarding-logo" src="\.\/icons\/logo\.png" alt="">\s*$/);
});

test('the walkthrough has Saltar and the next button in one bar at the bottom, Saltar first', () => {
  const [bar = ''] = body.match(/<div class="onboarding-actions">[\s\S]*?<\/div>/) ?? [];
  const buttons = [...bar.matchAll(/<button id="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(buttons, ['onboarding-skip', 'onboarding-next']);
  assert.doesNotMatch(body, /onboarding-top/);
});

test('the What\'s new sheet has a veil, a dialog with its title and Close, and a body (VER-22)', () => {
  const [layer = ''] = body.match(/<div id="whatsnew-sheet" class="sheet-layer"[\s\S]*?<\/section>\s*<\/div>/) ?? [];
  assert.match(layer, /<div id="whatsnew-veil" class="sheet-veil">/);
  assert.match(layer, /<section id="whatsnew" class="sheet" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">/);
  assert.match(layer, /<h2 id="whatsnew-title" class="sheet-title main" data-i18n="whatsNew.title"><\/h2><button id="whatsnew-close" class="button tonal" type="button" data-i18n="whatsNew.close"><\/button>/);
  assert.match(layer, /<div id="whatsnew-body" class="sheet-body whatsnew-body"><\/div>/);
});

test('Help in Settings has the What\'s new row, hidden until there are notes (VER-23)', () => {
  assert.match(body, /<button id="show-whatsnew" class="settings-row" type="button" hidden><span class="settings-row-label" data-i18n="settings.whatsNew"><\/span><span class="chevron" aria-hidden="true">›<\/span><\/button>/);
});

test('the account screens cover the app: Sign in with Google or offline, and Waiting for approval (ACC-2)', () => {
  const [layer = ''] = body.match(/<section id="auth" class="account" role="dialog" aria-modal="true"[\s\S]*?<\/section>/) ?? [];
  assert.match(layer, /<div id="login" class="account-page">/);
  assert.match(layer, /<h2 id="login-title" class="account-title" tabindex="-1" data-i18n="account.login.title">/);
  assert.match(layer, /<button id="login-google" class="button tonal wide" type="button"><svg class="icon small" aria-hidden="true"><use href="icons.svg#google"\/><\/svg>/);
  assert.match(layer, /<p id="login-error" class="input-help danger" role="alert" hidden><\/p>\s*<button id="login-offline" class="button accent" type="button" data-i18n="account.offline"><\/button>/);
  assert.match(layer, /<div id="waiting" class="account-page" hidden>/);
  assert.match(layer, /<h2 id="waiting-title" class="account-title" tabindex="-1" data-i18n="account.waiting.title">/);
  const buttons = [...layer.matchAll(/<button id="(waiting-[^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(buttons, ['waiting-check', 'waiting-logout']);
});

test('Settings has the Account group: the email and Log out, or Sign in with Google (ACC-8)', () => {
  const [group = ''] = body.match(/<div id="account-group" hidden>[\s\S]*?<\/div>\s*<\/div>/) ?? [];
  assert.match(group, /data-i18n="settings.account"/);
  assert.match(group, /<span id="account-email" class="settings-row-label"><\/span>/);
  assert.match(group, /<div id="account-row" class="settings-row"><span id="account-email" class="settings-row-label"><\/span><\/div>/);
  assert.match(group, /<button id="logout" class="settings-row" type="button">/);
  assert.match(group, /<button id="account-login" class="settings-row" type="button"><span class="settings-row-label" data-i18n="account.signIn"><\/span>/);
});

test('Backup ends with Delete all data, a danger row with no chevron (SET-2)', () => {
  assert.match(body, /<button id="import" class="settings-row" type="button">.*?<\/button>\s*<button id="reset" class="settings-row danger" type="button"><span class="settings-row-label" data-i18n="settings.reset"><\/span><\/button>\s*<\/div>/);
});
