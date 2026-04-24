'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock browser globals before requiring the module
global.window = global.window || {};
global.document = global.document || {};
global.$ = global.$ || (() => ({ ready: () => {} }));
global.mapboxgl = {
  accessToken: null,
  Map: class { constructor() {} on() {} },
};

const { dealersToGeoJSON, ensureHttp } = require('../js/gewa-mapbox.js');

// ── ensureHttp (same logic as dealers, verified independently) ────────────────

describe('ensureHttp', () => {
  it('returns # for null', () => assert.equal(ensureHttp(null), '#'));
  it('returns # for empty string', () => assert.equal(ensureHttp(''), '#'));
  it('passes through https:// URLs unchanged', () => assert.equal(ensureHttp('https://example.com'), 'https://example.com'));
  it('prepends https:// to bare domains', () => assert.equal(ensureHttp('example.com'), 'https://example.com'));
});

// ── dealersToGeoJSON ──────────────────────────────────────────────────────────

describe('dealersToGeoJSON', () => {
  const valid = {
    Name: 'Test Shop',
    Address: '123 Main St, Springfield, IL',
    City: 'Springfield',
    Phone: '(217) 555-0000',
    Website: ['www.testshop.com'],
    PlusCode: '',
    Latitude: 39.7817,
    Longitude: -89.6501,
  };

  it('returns a GeoJSON FeatureCollection', () => {
    const geojson = dealersToGeoJSON([valid]);
    assert.equal(geojson.type, 'FeatureCollection');
    assert.ok(Array.isArray(geojson.features));
  });

  it('maps each dealer to a Point Feature', () => {
    const { features } = dealersToGeoJSON([valid]);
    assert.equal(features.length, 1);
    assert.equal(features[0].type, 'Feature');
    assert.equal(features[0].geometry.type, 'Point');
  });

  it('puts longitude first in coordinates (GeoJSON spec)', () => {
    const { features } = dealersToGeoJSON([valid]);
    const [lng, lat] = features[0].geometry.coordinates;
    assert.equal(lng, valid.Longitude);
    assert.equal(lat, valid.Latitude);
  });

  it('copies Name, Address, Phone into properties', () => {
    const { features } = dealersToGeoJSON([valid]);
    const props = features[0].properties;
    assert.equal(props.Name, valid.Name);
    assert.equal(props.Address, valid.Address);
    assert.equal(props.Phone, valid.Phone);
  });

  it('serializes Website array as a JSON string in properties', () => {
    const { features } = dealersToGeoJSON([valid]);
    assert.equal(features[0].properties.Website, JSON.stringify(valid.Website));
  });

  it('sets Website property to empty string when array is empty', () => {
    const { features } = dealersToGeoJSON([{ ...valid, Website: [] }]);
    assert.equal(features[0].properties.Website, '');
  });

  it('filters out dealers with null Latitude', () => {
    const noLat = { ...valid, Latitude: null };
    const { features } = dealersToGeoJSON([valid, noLat]);
    assert.equal(features.length, 1);
  });

  it('filters out dealers with null Longitude', () => {
    const noLng = { ...valid, Longitude: null };
    const { features } = dealersToGeoJSON([valid, noLng]);
    assert.equal(features.length, 1);
  });

  it('returns an empty FeatureCollection when all dealers lack coordinates', () => {
    const { features } = dealersToGeoJSON([{ ...valid, Latitude: null, Longitude: null }]);
    assert.equal(features.length, 0);
  });

  it('returns an empty FeatureCollection for an empty dealer list', () => {
    const { features } = dealersToGeoJSON([]);
    assert.equal(features.length, 0);
  });

  it('defaults missing PlusCode to empty string in properties', () => {
    const { features } = dealersToGeoJSON([{ ...valid, PlusCode: undefined }]);
    assert.equal(features[0].properties.PlusCode, '');
  });

  it('defaults missing Phone to empty string in properties', () => {
    const { features } = dealersToGeoJSON([{ ...valid, Phone: undefined }]);
    assert.equal(features[0].properties.Phone, '');
  });
});
