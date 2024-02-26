/**
 * Mapbox code for Gewa.
 */

"use strict";

const token = 'pk.eyJ1IjoidGltaHNpZWgiLCJhIjoiY2xzdWkxbGp4MDVoMzJqbHFvYWtoaGw4eSJ9.bKE5yaFsALONvh0mRXSONg';
const sheet = 'https://docs.google.com/spreadsheets/d/1OjZjaZGoay1VXQeizjwg67A1Soi9q0ra3EVYmH6-9_Q/gviz/tq?tqx=out:csv&sheet=Sheet1';

var transformRequest = (url, resourceType) => {
  var isMapboxRequest =
    url.slice(8, 22) === "api.mapbox.com" ||
    url.slice(10, 26) === "tiles.mapbox.com";
  return {
    url: isMapboxRequest
      ? url.replace("?", "?pluginName=sheetMapper&")
      : url
  };
};

// Mapbox token
mapboxgl.accessToken = token;
var map = new mapboxgl.Map({
  container: 'map', // container id
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-98.579500, 39.828300], // starting position [lng, lat]
  zoom: 4,// starting zoom
  zoomAnimation: false,
  transformRequest: transformRequest
});
var loaded = false;

$(document).ready(function () {
  $.ajax({
    type: "GET",
    url: sheet,
    dataType: "text",
    success: function (csvData) { makeGeoJSON(csvData); }
  });

  map.on('load', function () {
    loaded = true;
  });

  /**
   * Setup the map after loading.
   *
   * @param {*} data
   *   CSV data.
   */
  function setupMap(data) {

    map.addLayer({
      id: 'csvData',
      type: 'symbol',
      source: {
        type: 'geojson',
        data: data,
      },
      layout: {
        'icon-image': 'music',
      },
    });

    map.on('click', 'csvData', function (e) {
      let coordinates = e.features[0].geometry.coordinates.slice();

      // Set popup text. You can adjust the values of the popup to match the
      // headers of your CSV. E.g., e.features[0].properties.Name is retrieving
      // information from the field Name in the original CSV.
      let address = e.features[0].properties.Address;
      let url = `https://www.google.com/maps/dir//${encodeURI(address)}`;
      let description = `<h3>${e.features[0].properties.Name}</h3>`;
      description += `<h4><a target='_blank' href='${url}'>Directions</a></h4>`;
      description += `<h4><b>Address:</b> ${address}</h4>`;
      description += `<h4><b>Phone:</b> ${e.features[0].properties.Phone}</h4>`;

      // Ensure that if the map is zoomed out such that multiple
      // copies of the feature are visible, the popup appears
      // over the copy being pointed to.
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Add Popup to map.
      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
    })

    // Change the cursor to a pointer when the mouse is over the places layer.
    map.on('mouseenter', 'csvData', function () {
      map.getCanvas().style.cursor = 'pointer'
    });

    // Change it back to a pointer when it leaves.
    map.on('mouseleave', 'places', function () {
      map.getCanvas().style.cursor = ''
    });

    var bbox = turf.bbox(data);
    map.fitBounds(bbox, { padding: 50 });
  }

  /**
   * Convert CSV to GeoJSON and setup the map.
   * @param {*} csvData
   *   CSV version of the data.
   */
  function makeGeoJSON(csvData) {
    csv2geojson.csv2geojson(csvData, {
      latfield: 'Latitude',
      lonfield: 'Longitude',
      delimiter: ','
    }, function (err, data) {

      // Wait until we're loaded to set up the map. If csv2geojson takes too
      // long, we could get here after the load event has already fired.
      if (loaded) {
        setupMap(data);
      }
      else {
        map.on('load', function () {
          setupMap(data);
        });
      }
    });
  };
});
