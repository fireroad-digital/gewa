/**
 * Gewa code to render dealer listings
 */

"use strict";

const sheet = 'https://docs.google.com/spreadsheets/d/1OjZjaZGoay1VXQeizjwg67A1Soi9q0ra3EVYmH6-9_Q/gviz/tq?tqx=out:json&sheet=Sheet1'

$(document).ready(function () {
  $.ajax({
    type: 'GET',
    url: sheet,
    dataType: 'text',
    success: function (csvData) {

      // Extract and parse JSON string.
      let sheetData = JSON.parse(csvData.substring(47).slice(0, -2))
      let colMap = getColMap(sheetData.table)
      sortByState(colMap, sheetData.table.rows);
      let currentState = "";
      sheetData.table.rows.forEach((row) => {
        let abbr = row['c'][colMap['State Abb']].v
        if (row['c'][colMap["State"]].v != currentState) {
          currentState = row['c'][colMap["State"]].v;
          $('#dealers').append(`<div class="state-wrapper clearfix"><h3>${currentState}</h3><div id="state-${abbr}" class="dealers-state"></div></div>`)
        }
        $(`#state-${abbr}`).append(renderDealer(colMap, row['c']))
      })

      // Notify the parent so it can set the iframe height.
      window.parent.postMessage({
        type: 'GEWA_SET_HEIGHT',
        data: {
          height: document.body.scrollHeight
        }
      },
      '*')
    }
  })
})

/**
 * Render a single dealer.
 *
 * @param object map
 *   Map of column names to column indexes.
 * @param array column
 *   Array of column values.
 */
function renderDealer(map, column) {

  let output = '<address>';

  if (column[map.Name]!= undefined) {
    output += `<span class="dealer-name">${column[map.Name].v}</span><br />`;
  }
  if (column[map.AddressLine1] != undefined) {
    output += `${column[map.AddressLine1].v} <br />`;
  }
  if (column[map.AddressLine2] != undefined) {
    output += `${column[map.AddressLine2].v} <br />`;
  }
  if (column[map.City] != undefined) {
    output += `${column[map.City].v}`;
  }
  if (column[map["State Abb"]] != undefined) {
    output += `, ${column[map["State Abb"]].v}`;
  }
  if (column[map["Zip Code"]] != undefined) {
    output += ` ${column[map["Zip Code"]].v}`;
  }
  output += `<br />`;
  if (column[map.Phone] != undefined) {

    // Strip out non-numeric characters for the phone number href.
    let num = column[map.Phone].v;
    num.replace(/\D/g, '');
    output += `<a href="tel:+1${num}">${column[map.Phone].v}</a> <br />`;
  }
  if (column[map.Website] != undefined && column[map.Website].v!= null) {
    output += `<a href="${column[map.Website].v}">${column[map.Website].v}</a> <br />`;
  }

  output += '</div></address>';

  return output;
}

/**
 * Get map of column names to indexes.
 *
 * @param table
 *   Table data from Google Sheets JSON.
 *
 * @returns object
 *   Object mapping column labels to indexes.
 */
function getColMap(table) {
  let colMap = {};
  for (let i = 0; i < table.cols.length; i++) {
    colMap[table.cols[i].label] = i
  }
  return colMap
}

/**
 * Sort an array of Google Sheets rows by state.
 *
 * Note that states are sorted by abbreviation and not full name.
 *
 * @param object map
 *   Map of column names to column indexes.
 * @param {*} rows
 *   Array of rows from Google Sheets JSON.
 */
function sortByState(map, rows) {
  rows.sort((a, b) => {
    if (a.c[map["State"]].v < b.c[map["State"]].v) {
      return -1;
    }
    if (a.c[map["State"]].v > b.c[map["State"]].v) {
      return 1;
    }
    return 0;
  });
}
