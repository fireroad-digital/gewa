'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock browser globals before requiring the module
global.window = {};
global.document = {};
global.$ = () => ({ ready: () => {} });

const { renderDealer, ensureHttp, cfg } = require('../js/gewa-dealers.js');

// ── ensureHttp ────────────────────────────────────────────────────────────────

describe('ensureHttp', () => {
  it('returns # for null', () => assert.equal(ensureHttp(null), '#'));
  it('returns # for undefined', () => assert.equal(ensureHttp(undefined), '#'));
  it('returns # for empty string', () => assert.equal(ensureHttp(''), '#'));
  it('passes through https:// URLs unchanged', () => assert.equal(ensureHttp('https://example.com'), 'https://example.com'));
  it('passes through http:// URLs unchanged', () => assert.equal(ensureHttp('http://example.com'), 'http://example.com'));
  it('prepends https:// to bare domains', () => assert.equal(ensureHttp('example.com'), 'https://example.com'));
  it('is case-insensitive for the protocol check', () => assert.equal(ensureHttp('HTTPS://example.com'), 'HTTPS://example.com'));
});

// ── renderDealer ──────────────────────────────────────────────────────────────

describe('renderDealer', () => {
  const base = {
    Name: 'Test Shop',
    AddressLine1: '123 Main St',
    AddressLine2: null,
    City: 'Springfield',
    StateAbb: 'IL',
    ZipCode: '62701',
    Phone: '(217) 555-1234',
    Website: ['www.testshop.com'],
  };

  beforeEach(() => {
    // Reset to defaults so one test's cfg mutation doesn't bleed into the next
    cfg.fields = undefined;
  });

  it('wraps output in <address> tags', () => {
    const html = renderDealer(base);
    assert.ok(html.startsWith('<address>'), 'should start with <address>');
    assert.ok(html.endsWith('</address>'), 'should end with </address>');
  });

  it('includes dealer name in a .dealer-name span', () => {
    const html = renderDealer(base);
    assert.ok(html.includes('<span class="dealer-name">Test Shop</span>'));
  });

  it('omits name span when Name is missing', () => {
    const html = renderDealer({ ...base, Name: null });
    assert.ok(!html.includes('dealer-name'));
  });

  it('includes AddressLine1', () => {
    const html = renderDealer(base);
    assert.ok(html.includes('123 Main St'));
  });

  it('includes AddressLine2 when present', () => {
    const html = renderDealer({ ...base, AddressLine2: 'Suite 200' });
    assert.ok(html.includes('Suite 200'));
  });

  it('omits AddressLine2 when null', () => {
    const html = renderDealer({ ...base, AddressLine2: null });
    assert.ok(!html.includes('null'));
  });

  it('renders city, state abbreviation, and zip on one line', () => {
    const html = renderDealer(base);
    assert.ok(html.includes('Springfield, IL 62701'));
  });

  it('formats phone as a tel: link stripping non-digit characters', () => {
    const html = renderDealer(base);
    assert.ok(html.includes('href="tel:+12175551234"'));
    assert.ok(html.includes('>(217) 555-1234<'));
  });

  it('renders website URL with https:// prepended', () => {
    const html = renderDealer(base);
    assert.ok(html.includes('href="https://www.testshop.com"'));
    assert.ok(html.includes('>www.testshop.com<'));
  });

  it('omits phone when Phone is not in cfg.fields', () => {
    cfg.fields = ['Website'];
    const html = renderDealer(base);
    assert.ok(!html.includes('tel:'));
  });

  it('omits website when Website is not in cfg.fields', () => {
    cfg.fields = ['Phone'];
    const html = renderDealer(base);
    assert.ok(!html.includes('www.testshop.com'));
  });

  it('omits website section when Website array is empty', () => {
    const html = renderDealer({ ...base, Website: [] });
    assert.ok(!html.includes('testshop'));
  });

  it('skips empty strings inside the Website array', () => {
    const html = renderDealer({ ...base, Website: ['', 'www.valid.com'] });
    assert.ok(!html.includes('href="https://"'));
    assert.ok(html.includes('www.valid.com'));
  });

  it('renders PlusCode in a .plus-code element when present', () => {
    const html = renderDealer({ ...base, PlusCode: '87C4+RX Springfield' });
    assert.ok(html.includes('plus-code'));
    assert.ok(html.includes('87C4+RX Springfield'));
  });

  it('omits PlusCode element when PlusCode is absent', () => {
    const html = renderDealer(base);
    assert.ok(!html.includes('plus-code'));
  });
});
