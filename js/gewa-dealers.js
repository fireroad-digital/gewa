/**
 * Gewa code to render dealer listings
 */

"use strict";

var cfg = window.GEWA_CONFIG || {};

$(document).ready(function () {
  if (cfg.title) {
    $('h2').text(cfg.title);
  }

  $.ajax({
    type: 'GET',
    url: cfg.dataUrl,
    dataType: 'json',
    cache: false,
    success: function (data) {
      let dealers = data.dealers;

      dealers.sort(function (a, b) {
        if (a.State < b.State) return -1;
        if (a.State > b.State) return 1;
        return 0;
      });

      let currentState = '';
      dealers.forEach(function (dealer) {
        let abbr = dealer.StateAbb;
        if (dealer.State !== currentState) {
          currentState = dealer.State;
          $('#dealers').append(`<div class="state-wrapper clearfix"><h3>${currentState}</h3><div id="state-${abbr}" class="dealers-state"></div></div>`);
        }
        $(`#state-${abbr}`).append(renderDealer(dealer));
      });

      // Notify the parent so it can set the iframe height.
      window.parent.postMessage({
        type: 'GEWA_SET_HEIGHT',
        data: { height: document.body.scrollHeight }
      }, '*');
    }
  });
});

/**
 * Render a single dealer.
 *
 * @param {object} dealer
 *   Dealer object from the unified data JSON.
 */
function renderDealer(dealer) {
  let fields = cfg.fields || ['Phone', 'Website'];
  let output = '<address>';

  if (dealer.Name) {
    output += `<span class="dealer-name">${dealer.Name}</span><br />`;
  }
  if (dealer.AddressLine1) {
    output += `${dealer.AddressLine1}<br />`;
  }
  if (dealer.AddressLine2) {
    output += `${dealer.AddressLine2}<br />`;
  }

  let cityLine = '';
  if (dealer.City) cityLine += dealer.City;
  if (dealer.StateAbb) cityLine += (cityLine ? ', ' : '') + dealer.StateAbb;
  if (dealer.ZipCode) cityLine += (cityLine ? ' ' : '') + dealer.ZipCode;
  if (cityLine) {
    output += `${cityLine}<br />`;
  }
  if (dealer.PlusCode) {
    output += `<small class="plus-code">Plus Code: ${dealer.PlusCode}</small><br />`;
  }

  if (fields.includes('Phone') && dealer.Phone) {
    let num = dealer.Phone.replace(/\D/g, '');
    output += `<a href="tel:+1${num}">${dealer.Phone}</a><br />`;
  }
  if (fields.includes('Website') && dealer.Website && dealer.Website.length > 0) {
    dealer.Website.forEach(function (site) {
      if (site) {
        output += `<a href="${ensureHttp(site)}">${site}</a><br />`;
      }
    });
  }
  if (fields.includes('Email') && dealer.Email) {
    output += `<a href="mailto:${dealer.Email}">${dealer.Email}</a><br />`;
  }

  output += '</address>';
  return output;
}

function ensureHttp(url) {
  if (!url) return '#';
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}
