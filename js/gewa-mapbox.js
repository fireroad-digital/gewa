/**
 * Mapbox code for Gewa.
 */

"use strict";

var cfg = window.GEWA_CONFIG || {};
var token = cfg.mapboxToken || 'pk.eyJ1IjoidGltaHNpZWgiLCJhIjoiY2xzdWkxbGp4MDVoMzJqbHFvYWtoaGw4eSJ9.bKE5yaFsALONvh0mRXSONg';

mapboxgl.accessToken = token;
var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-98.579500, 39.828300],
  zoom: 4,
  zoomAnimation: false
});
var loaded = false;

$(document).ready(function () {
  $.ajax({
    type: 'GET',
    url: cfg.dataUrl,
    dataType: 'json',
    success: function (data) { makeGeoJSON(data.dealers); }
  });

  map.on('load', function () {
    loaded = true;
  });

  /**
   * Setup the map with GeoJSON data.
   *
   * @param {object} geojson
   *   GeoJSON FeatureCollection.
   */
  function setupMap(geojson) {
    map.addLayer({
      id: 'csvData',
      type: 'symbol',
      source: {
        type: 'geojson',
        data: geojson
      },
      layout: {
        'icon-image': 'music'
      }
    });

    map.on('click', 'csvData', function (e) {
      let props = e.features[0].properties;
      let coordinates = e.features[0].geometry.coordinates.slice();
      let address = props.Address;
      let url = `https://www.google.com/maps/dir//${encodeURI(address)}`;

      let description = `<h3>${props.Name}</h3>`;
      description += `<h4><a target='_blank' href='${url}'>Directions</a></h4>`;
      description += `<h4><b>Address:</b> ${address}</h4>`;
      if (props.Phone) {
        description += `<h4><b>Phone:</b> ${props.Phone}</h4>`;
      }
      // Website is serialized as a JSON string in GeoJSON properties.
      if (props.Website) {
        let websites = JSON.parse(props.Website);
        websites.forEach(function (site) {
          description += `<h4><a target='_blank' href='${ensureHttp(site)}'>${site}</a></h4>`;
        });
      }

      // Ensure that if the map is zoomed out such that multiple
      // copies of the feature are visible, the popup appears
      // over the copy being pointed to.
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
    });

    map.on('mouseenter', 'csvData', function () {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'csvData', function () {
      map.getCanvas().style.cursor = '';
    });

    var bbox = turf.bbox(geojson);
    map.fitBounds(bbox, { padding: 50 });
  }

  /**
   * Convert dealer array to GeoJSON and set up the map.
   *
   * @param {Array} dealers
   *   Dealer objects from the unified data JSON.
   */
  function makeGeoJSON(dealers) {
    var features = dealers
      .filter(function (d) { return d.Latitude != null && d.Longitude != null; })
      .map(function (d) {
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [d.Longitude, d.Latitude]
          },
          properties: {
            Name: d.Name,
            Address: d.Address,
            Phone: d.Phone || '',
            // Arrays can't be stored directly in GeoJSON properties; serialize.
            Website: d.Website && d.Website.length ? JSON.stringify(d.Website) : ''
          }
        };
      });

    var geojson = { type: 'FeatureCollection', features: features };

    if (loaded) {
      setupMap(geojson);
    } else {
      map.on('load', function () {
        setupMap(geojson);
      });
    }
  }
});

function ensureHttp(url) {
  if (!url) return '#';
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}
