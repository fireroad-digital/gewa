"use strict";const sheet="https://docs.google.com/spreadsheets/d/1OjZjaZGoay1VXQeizjwg67A1Soi9q0ra3EVYmH6-9_Q/gviz/tq?tqx=out:json&sheet=Sheet1";function renderDealer(e,t){let a="<address>";if(null!=t[e.Name]&&(a+=`<span class="dealer-name">${t[e.Name].v}</span><br />`),null!=t[e.AddressLine1]&&(a+=`${t[e.AddressLine1].v} <br />`),null!=t[e.AddressLine2]&&(a+=`${t[e.AddressLine2].v} <br />`),null!=t[e.City]&&(a+=`${t[e.City].v}`),null!=t[e["State Abb"]]&&(a+=`, ${t[e["State Abb"]].v}`),null!=t[e["Zip Code"]]&&(a+=` ${t[e["Zip Code"]].v}`),a+="<br />",null!=t[e.Phone]){let s=t[e.Phone].v;s.replace(/\D/g,""),a+=`<a href="tel:+1${s}">${t[e.Phone].v}</a> <br />`}return null!=t[e.Website]&&null!=t[e.Website].v&&(a+=`<a href="${t[e.Website].v}">${t[e.Website].v}</a> <br />`),a+="</div></address>",a}function getColMap(e){let t={};for(let a=0;a<e.cols.length;a++)t[e.cols[a].label]=a;return t}function sortByState(e,t){t.sort(((t,a)=>t.c[e.State].v<a.c[e.State].v?-1:t.c[e.State].v>a.c[e.State].v?1:0))}$(document).ready((function(){$.ajax({type:"GET",url:sheet,dataType:"text",success:function(e){let t=JSON.parse(e.substring(47).slice(0,-2)),a=getColMap(t.table);sortByState(a,t.table.rows);let s="";t.table.rows.forEach((e=>{let t=e.c[a["State Abb"]].v;e.c[a.State].v!=s&&(s=e.c[a.State].v,$("#dealers").append(`<div class="state-wrapper clearfix"><h3>${s}</h3><div id="state-${t}" class="dealers-state"></div></div>`)),$(`#state-${t}`).append(renderDealer(a,e.c))})),window.parent.postMessage({type:"GEWA_SET_HEIGHT",data:{height:document.body.scrollHeight}},"*")}})}));