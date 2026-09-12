/* Marktliste: Einkaufsliste nach Markt sortiert.
   Laeuft lokal im Browser, gleicht sich optional ueber Firebase mit anderen
   Geraeten ab. Ohne Zugangsdaten in firebase-config.js bleibt alles lokal. */
(function(){
"use strict";

var KEY = "marktliste.v1";
var CODE_KEY = "marktliste.code";
var CFG_KEY = "marktliste.firebase";
var SDK = "https://www.gstatic.com/firebasejs/10.12.5/";
var COLORS = ["#2E86AB","#E4572E","#6A4C93","#3F8F5F","#C9A227","#B5446E","#2F7D7A","#8A6A4B"];

function uid(){ return Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function $(s){ return document.querySelector(s); }

/* ---------- Startdaten ---------- */
function seed(){
  var m = [
    {id:"m1", name:"Rewe",    color:COLORS[0], order:0},
    {id:"m2", name:"Aldi",    color:COLORS[1], order:1},
    {id:"m3", name:"dm",      color:COLORS[2], order:2},
    {id:"m4", name:"Bauhaus", color:COLORS[4], order:3}
  ];
  return {markets:m, catalog:[], items:[]};
}

var db;
try { var raw = localStorage.getItem(KEY); db = raw ? JSON.parse(raw) : seed(); }
catch(e){ db = seed(); }
if(!db || !Array.isArray(db.markets)) db = seed();
db.markets = db.markets || []; db.catalog = db.catalog || []; db.items = db.items || [];
db.markets.forEach(function(m, i){ if(typeof m.order !== "number") m.order = i; });
db.items.forEach(function(it, i){ if(typeof it.createdAt !== "number") it.createdAt = i; });

var ui = {tab:"liste", filter:"all", picked:null, fresh:null};

/* Was gerade neu dazukam, wird beim naechsten Aufbau einmal hervorgehoben.
   Die Markierung gilt nur fuer diesen einen Durchlauf. */
function isFresh(id){ return ui.fresh === id ? " fresh" : ""; }

function save(){ try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){} }
function market(id){ return db.markets.filter(function(m){return m.id===id;})[0] || null; }

/* ---------- Aenderungen: lokal speichern und weitergeben ---------- */
function put(kind, obj){
  var list = db[kind];
  var i = -1;
  list.forEach(function(x, n){ if(x.id === obj.id) i = n; });
  if(i < 0) list.push(obj); else list[i] = obj;
  save(); SYNC.put(kind, obj);
}
function drop(kind, id){
  db[kind] = db[kind].filter(function(x){ return x.id !== id; });
  save(); SYNC.drop(kind, id);
}
function item(id){ return db.items.filter(function(i){ return i.id===id; })[0] || null; }

function addToMarket(name, marketId){
  var dup = db.items.some(function(i){
    return i.marketId === marketId && i.name.toLowerCase() === name.toLowerCase() && !i.done;
  });
  if(dup) return;
  var it = {id:uid(), name:name, marketId:marketId, done:false, createdAt:Date.now()};
  put("items", it);
  ui.fresh = it.id;
}

/* ---------- Abgleich ueber Firebase ---------- */
var SYNC = (function(){
  var cfg = null, code = null, ref = null, fb = null;
  var mode = "off", note = "", applying = false, started = false;

  function readConfig(){
    var c = window.MARKTLISTE_FIREBASE || null;
    try {
      var stored = localStorage.getItem(CFG_KEY);
      if(stored) c = JSON.parse(stored);
    } catch(e){}
    if(!c || !c.apiKey || !c.databaseURL) return null;
    return c;
  }
  function readCode(){
    var m = (location.hash || "").match(/[#/]liste=([A-Za-z0-9_-]{4,24})/);
    if(m) return m[1];
    try { return localStorage.getItem(CODE_KEY) || null; } catch(e){ return null; }
  }
  function newCode(){
    var a = "abcdefghjkmnpqrstuvwxyz23456789", s = "";
    for(var i=0;i<8;i++) s += a[Math.floor(Math.random()*a.length)];
    return s;
  }
  function rememberCode(c){
    code = c;
    try { localStorage.setItem(CODE_KEY, c); } catch(e){}
    if(location.hash.indexOf("liste=" + c) < 0){
      try { history.replaceState(null, "", "#liste=" + c); } catch(e){ location.hash = "liste=" + c; }
    }
  }
  function link(){
    return code ? location.origin + location.pathname + "#liste=" + code : "";
  }
  function set(m, n){ mode = m; note = n || ""; renderSync(); renderHead(); }

  function loadScripts(files, done, fail){
    var next = function(){
      if(!files.length) return done();
      var s = document.createElement("script");
      s.src = SDK + files.shift();
      s.onload = next;
      s.onerror = function(){ fail("Die Firebase-Bibliothek liess sich nicht laden."); };
      document.head.appendChild(s);
    };
    next();
  }

  function start(){
    cfg = readConfig();
    if(!cfg){ set("off"); return; }
    if(started) return;
    started = true;
    if(!code) rememberCode(readCode() || newCode());
    set("connecting");
    loadScripts(["firebase-app-compat.js","firebase-auth-compat.js","firebase-database-compat.js"],
      connect, function(msg){ started = false; set("error", msg); });
  }

  function connect(){
    try {
      fb = window.firebase;
      if(!fb.apps.length) fb.initializeApp(cfg);
      fb.auth().signInAnonymously()["catch"](function(err){
        started = false;
        set("error", err && err.code === "auth/operation-not-allowed"
          ? "In der Firebase-Konsole unter Authentication die anonyme Anmeldung freischalten."
          : "Anmeldung fehlgeschlagen: " + (err && err.message ? err.message : err));
      });
      fb.auth().onAuthStateChanged(function(user){ if(user && !ref) attach(); });
    } catch(err){
      started = false;
      set("error", "Firebase liess sich nicht starten: " + (err && err.message ? err.message : err));
    }
  }

  function attach(){
    ref = fb.database().ref("listen/" + code);
    fb.database().ref(".info/connected").on("value", function(s){
      if(mode === "error") return;
      set(s.val() ? "online" : "offline");
    });
    ref.on("value", onRemote, function(err){
      set("error", "Kein Zugriff auf die Liste: " + (err && err.message ? err.message : err));
    });
  }

  function toList(obj, extra){
    return Object.keys(obj || {}).map(function(id){
      var v = obj[id] || {};
      v.id = id;
      return v;
    }).sort(extra);
  }

  function onRemote(snap){
    var v = snap.val();
    if(!v || (!v.items && !v.markets && !v.catalog)){ pushAll(); set(mode === "offline" ? "offline" : "online"); return; }
    applying = true;
    db.markets = toList(v.markets, function(a,b){ return (a.order||0) - (b.order||0); });
    db.catalog = toList(v.catalog, function(a,b){ return a.name.localeCompare(b.name,"de"); });
    db.items   = toList(v.items,   function(a,b){ return (a.createdAt||0) - (b.createdAt||0); });
    db.items.forEach(function(i){ i.done = !!i.done; i.qty = i.qty || ""; i.marketId = i.marketId || null; });
    applying = false;
    save(); render();
  }

  function clean(o){
    var out = {};
    Object.keys(o).forEach(function(k){
      if(k !== "id" && o[k] !== undefined && o[k] !== null) out[k] = o[k];
    });
    return out;
  }

  function pushAll(){
    if(!ref) return;
    var payload = {markets:{}, catalog:{}, items:{}};
    db.markets.forEach(function(m, i){ m.order = i; payload.markets[m.id] = clean(m); });
    db.catalog.forEach(function(c){ payload.catalog[c.id] = clean(c); });
    db.items.forEach(function(i){ payload.items[i.id] = clean(i); });
    ref.set(payload);
  }

  return {
    start: start,
    isOn: function(){ return !!ref; },
    mode: function(){ return mode; },
    note: function(){ return note; },
    code: function(){ return code; },
    link: link,
    configured: function(){ return !!readConfig(); },
    put: function(kind, obj){ if(ref && !applying) ref.child(kind + "/" + obj.id).set(clean(obj)); },
    drop: function(kind, id){ if(ref && !applying) ref.child(kind + "/" + id).remove(); },
    pushAll: pushAll,
    wipe: function(){ if(ref) ref.remove(); },
    join: function(c){
      c = (c || "").trim().toLowerCase().replace(/^.*liste=/, "");
      if(!/^[a-z0-9_-]{4,24}$/.test(c)) return "Der Code besteht aus mindestens vier Zeichen.";
      if(ref){ ref.off(); ref = null; }
      started = false;
      rememberCode(c);
      start();
      return null;
    },
    saveConfig: function(text){
      var t = (text || "").trim();
      if(!t){
        try { localStorage.removeItem(CFG_KEY); } catch(e){}
        return null;
      }
      var m = t.match(/\{[\s\S]*\}/);
      if(!m) return "Da war keine Konfiguration drin. Den Block von { bis } aus der Firebase-Konsole einfügen.";
      var obj;
      try { obj = JSON.parse(m[0].replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,(\s*[}\]])/g, "$1")); }
      catch(e){ return "Die Konfiguration liess sich nicht lesen."; }
      if(!obj.apiKey || !obj.databaseURL) return "Es fehlt apiKey oder databaseURL. Die Realtime Database muss im Projekt angelegt sein.";
      try { localStorage.setItem(CFG_KEY, JSON.stringify(obj)); } catch(e){ return "Der Browser speichert nichts, privater Modus?"; }
      return null;
    }
  };
})();

/* ---------- Einkaufsliste: nur abhaken ---------- */
function groupsFor(){
  var out = [];
  var loose = db.items.filter(function(i){ return !market(i.marketId); });
  if(loose.length) out.push({id:"", name:"Noch keinem Markt zugeordnet", color:"var(--ink-3)", items:loose});
  db.markets.forEach(function(m){
    out.push({id:m.id, name:m.name, color:m.color, items:db.items.filter(function(i){ return i.marketId===m.id; })});
  });
  return out;
}

function renderChips(){
  var open = db.items.filter(function(i){ return !i.done; }).length;
  var html = '<button type="button" class="chip" data-drop="" data-act="filter" data-id="all" aria-pressed="' +
             (ui.filter==="all") + '">Alle <span class="n">' + open + '</span></button>';
  groupsFor().forEach(function(g){
    var o = g.items.filter(function(i){ return !i.done; }).length;
    html += '<button type="button" class="chip" data-drop="' + g.id + '" data-act="filter" data-id="' + (g.id||"none") +
            '" aria-pressed="' + (ui.filter===(g.id||"none")) + '">' +
            '<span class="dot" style="background:' + g.color + '"></span>' + esc(g.id ? g.name : "Ohne Markt") +
            ' <span class="n">' + o + '</span></button>';
  });
  $("#chips").innerHTML = html;
}

function itemRow(it){
  return '<li class="item' + (it.done ? " done" : "") + isFresh(it.id) + '" data-drag="item" data-id="' + it.id + '">' +
    '<button type="button" class="tick" data-act="toggle" data-id="' + it.id + '" aria-pressed="' + it.done +
      '" aria-label="' + esc(it.name) + ' abhaken">' +
      '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>' +
    '<span class="itemname">' + esc(it.name) + '</span>' +
    '<button type="button" class="x" data-act="del-item" data-id="' + it.id + '" aria-label="' + esc(it.name) + ' entfernen">✕</button>' +
    '</li>';
}

function renderGroups(){
  var groups = groupsFor().filter(function(g){
    if(ui.filter === "all") return g.items.length > 0;
    return (g.id || "none") === ui.filter;
  });
  var host = $("#groups");
  if(!db.items.length){
    host.innerHTML = '<div class="card"><p class="empty">Die Liste ist leer. Produkte in der Sammelliste einzutragen und in Märkte zuordnen.</p></div>';
  } else if(!groups.length){
    host.innerHTML = '<div class="card"><p class="empty">Für diesen Markt steht nichts an.</p></div>';
  } else {
    host.innerHTML = groups.map(function(g){
      var done = g.items.filter(function(i){ return i.done; }).length;
      var sorted = g.items.slice().sort(function(a,b){ return (a.done?1:0) - (b.done?1:0); });
      return '<section class="group" data-drop="' + g.id + '" data-group="' + (g.id||"none") + '">' +
        '<div class="strip" style="background:' + g.color + '"></div>' +
        '<div class="group-head"><span class="dot" style="background:' + g.color + '"></span>' +
          '<h2>' + esc(g.name) + '</h2>' +
          '<span class="count">' + done + '/' + g.items.length + '</span>' +
          '<span class="slot">' + (done ? '<button type="button" class="btn ghost small" data-act="clear-done" data-id="' + (g.id||"none") + '">Erledigte weg</button>' : "") + '</span>' +
        '</div>' +
        (sorted.length ? '<ul class="items">' + sorted.map(itemRow).join("") + '</ul>'
                       : '<p class="empty">Noch nichts für ' + esc(g.name) + '.</p>') +
      '</section>';
    }).join("");
  }
  renderCounts();
}

/* Zaehler und die beiden Aufraeum-Knoepfe nachziehen, ohne die Zeilen
   neu zu bauen: sonst springt beim Abhaken die Liste unter dem Finger. */
function renderCounts(){
  groupsFor().forEach(function(g){
    var sec = document.querySelector('[data-group="' + (g.id || "none") + '"]');
    if(!sec) return;
    var done = g.items.filter(function(i){ return i.done; }).length;
    sec.querySelector(".count").textContent = done + "/" + g.items.length;
    var slot = sec.querySelector(".slot");
    var has = !!slot.firstChild;
    if(done && !has){
      slot.innerHTML = '<button type="button" class="btn ghost small" data-act="clear-done" data-id="' + (g.id||"none") + '">Erledigte weg</button>';
    } else if(!done && has){
      slot.innerHTML = "";
    }
  });
  var anyDone = db.items.some(function(i){ return i.done; });
  var host = $("#liste-actions");
  var shown = !!host.firstChild;
  if(anyDone && !shown){
    host.innerHTML = '<button type="button" class="btn" data-act="clear-done" data-id="all">Alle erledigten entfernen</button>';
  } else if(!anyDone && shown){
    host.innerHTML = "";
  }
}

/* ---------- Sammelliste: eingeben + Märkte zuordnen ---------- */
function renderCatalog(){
  var host = $("#catalog");
  $("#cat-actions").innerHTML = db.catalog.length
    ? '<button type="button" class="btn ghost small" data-act="cat-clear">Sammelliste leeren</button>' : "";
  if(!db.catalog.length){
    host.innerHTML = '<p class="empty">Die Sammelliste ist leer. Oben ein Produkt eintragen.</p>';
    return;
  }
  var sorted = db.catalog.slice().sort(function(a,b){ return a.name.localeCompare(b.name,"de"); });
  host.innerHTML = '<div class="pills">' + sorted.map(function(c){
    var on = ui.picked === c.id;
    return '<span class="pill' + (on ? " picked" : "") + isFresh(c.id) + '" data-drag="product" data-id="' + c.id + '">' +
      '<button type="button" class="pillname" data-act="pick" data-id="' + c.id + '" aria-pressed="' + on + '">' +
        esc(c.name) + '</button>' +
      '<button type="button" class="drop" data-act="cat-del" data-id="' + c.id + '" aria-label="' + esc(c.name) +
        ' aus der Sammelliste löschen">✕</button>' +
    '</span>';
  }).join("") + '</div>';
}

function renderSammelMarkets(){
  var host = $("#sammel-markets");
  if(!db.markets.length){
    host.innerHTML = '<p class="empty">Keine Märkte. Im Tab Märkte welche anlegen.</p>';
    return;
  }
  var picked = ui.picked ? db.catalog.filter(function(c){ return c.id === ui.picked; })[0] : null;
  host.innerHTML = db.markets.map(function(m){
    var items = db.items.filter(function(i){ return i.marketId === m.id; });
    return '<div class="market-card' + (picked ? " armed" : "") + '" data-drop="' + m.id + '">' +
      '<button type="button" class="market-head" data-act="assign" data-id="' + m.id + '">' +
        '<span class="dot" style="background:' + m.color + '"></span>' +
        '<span class="mname">' + esc(m.name) + '</span>' +
        '<span class="muted">' + (picked ? "hierhin" : items.length) + '</span>' +
      '</button>' +
      '<div class="market-items">' + (items.length ? items.map(function(i){
        return '<div class="market-item' + isFresh(i.id) + '">' +
          '<span>' + esc(i.name) + '</span>' +
          '<button type="button" data-act="remove-item" data-id="' + i.id + '" class="x">✕</button>' +
        '</div>';
      }).join("") : '<p class="empty" style="padding:8px 14px;margin:0;font-size:.85rem">Noch nichts</p>') +
      '</div></div>';
  }).join("");

  var hint = $("#sammel-hint");
  if(hint) hint.textContent = picked
    ? "„" + picked.name + "“ ausgewählt – jetzt einen Markt antippen."
    : "Produkt antippen, dann den Markt antippen. Oder gedrückt halten und rüberziehen.";
}

/* ---------- Märkte: Produkte zuordnen ---------- */
function marketOptions(sel, nullLabel){
  var html = '<option value="">' + (nullLabel || "Ohne Markt") + '</option>';
  db.markets.forEach(function(m){
    html += '<option value="' + m.id + '"' + (m.id===sel ? " selected" : "") + '>' + esc(m.name) + '</option>';
  });
  return html;
}

function renderMarkets(){
  var host = $("#markets");
  if(!db.markets.length){
    host.innerHTML = '<p class="empty">Noch keine Märkte. Unten einen anlegen.</p>';
    return;
  }

  host.innerHTML = '<div class="mrow-list">' + db.markets.map(function(m){
    var n = db.items.filter(function(i){ return i.marketId === m.id; }).length;
    return '<div class="mrow' + isFresh(m.id) + '">' +
      '<span class="dot" style="background:' + m.color + '"></span>' +
      '<input type="text" value="' + esc(m.name) + '" data-act="rename" data-id="' + m.id + '" aria-label="Name des Markts">' +
      '<span class="swatches">' + COLORS.map(function(c){
        return '<button type="button" class="sw" style="background:' + c + '" data-act="color" data-id="' + m.id +
               '" data-color="' + c + '" aria-pressed="' + (c===m.color) + '" aria-label="Farbe ' + c + '"></button>';
      }).join("") + '</span>' +
      '<span class="muted" style="font-size:.78rem">' + n + ' auf der Liste</span>' +
      '<button type="button" class="x" data-act="del-market" data-id="' + m.id + '" aria-label="' + esc(m.name) + ' löschen">✕</button>' +
    '</div>';
  }).join("") + '</div>';
}

/* ---------- Geteilte Liste ---------- */
var SYNC_TEXT = {
  off:        ["ruht",      "Alles bleibt auf diesem Gerät."],
  connecting: ["verbindet", "Verbindung zur gemeinsamen Liste wird aufgebaut."],
  online:     ["verbunden", "Änderungen erscheinen auf allen Geräten mit demselben Link."],
  offline:    ["offline",   "Gerade keine Verbindung. Änderungen gehen raus, sobald wieder Netz da ist."],
  error:      ["Fehler",    ""]
};

function renderSync(){
  var host = $("#sync");
  if(!host) return;
  var mode = SYNC.mode();
  var t = SYNC_TEXT[mode] || SYNC_TEXT.off;
  var text = mode === "error" ? SYNC.note() : t[1];

  if(!SYNC.configured()){
    host.innerHTML =
      '<div><p class="label">Gemeinsame Liste</p>' +
      '<p class="muted">Noch nicht eingerichtet, die Liste liegt nur auf diesem Gerät. ' +
      'Firebase-Konfiguration einfügen (Firebase-Konsole, Projekteinstellungen, Web-App), dann gleichen sich alle Geräte ab. ' +
      'Dauerhaft für alle: dieselben Werte in <code>firebase-config.js</code> im Repo eintragen.</p></div>' +
      '<textarea id="sync-cfg" spellcheck="false" placeholder="const firebaseConfig = { apiKey: ... }" aria-label="Firebase-Konfiguration"></textarea>' +
      '<div class="row-btns"><button class="btn primary" type="button" data-act="sync-save">Verbinden</button></div>' +
      (mode === "error" ? '<p class="muted" style="color:var(--danger)">' + esc(SYNC.note()) + '</p>' : "");
    return;
  }

  host.innerHTML =
    '<div><p class="label">Gemeinsame Liste</p>' +
    '<p class="muted"><span class="syncdot ' + mode + '"></span>' + t[0] + '. ' + esc(text) + '</p></div>' +
    (SYNC.code() ?
      '<div><p class="label">Link zum Teilen</p>' +
      '<input type="text" id="sync-link" readonly value="' + esc(SYNC.link()) + '" aria-label="Link zur gemeinsamen Liste"></div>' +
      '<div class="row-btns">' +
        '<button class="btn" type="button" data-act="sync-copy">Link kopieren</button>' +
        '<button class="btn ghost" type="button" data-act="sync-new">Neue Liste starten</button>' +
      '</div>' : "") +
    '<div><p class="label">Einer Liste beitreten</p>' +
    '<div class="row-btns" style="gap:8px">' +
      '<input type="text" id="sync-join" placeholder="Code aus dem Link" style="flex:1 1 150px;width:auto" aria-label="Listen-Code">' +
      '<button class="btn" type="button" data-act="sync-join">Beitreten</button>' +
    '</div></div>' +
    '<p class="muted" id="sync-msg" hidden></p>';
}

/* ---------- Rahmen ---------- */
function renderHead(){
  var open = db.items.filter(function(i){ return !i.done; }).length;
  var done = db.items.length - open;
  var parts = [open + (open === 1 ? " Produkt offen" : " Produkte offen")];
  if(done) parts.push(done + " erledigt");
  parts.push(db.markets.length + (db.markets.length === 1 ? " Markt" : " Märkte"));
  var mode = SYNC.mode();
  if(mode !== "off") parts.push((SYNC_TEXT[mode] || SYNC_TEXT.off)[0]);
  $("#subline").textContent = parts.join(" · ");
}

function render(){
  renderHead();
  if(ui.tab === "liste"){ renderChips(); renderGroups(); }
  if(ui.tab === "sammel"){ renderCatalog(); renderSammelMarkets(); }
  if(ui.tab === "maerkte"){ renderMarkets(); renderSync(); }
  ui.fresh = null;
}

/* Der Balken unter dem gewaehlten Reiter wandert mit, statt hart
   umzuspringen. Position und Breite kommen vom Knopf selbst. */
var gliderPlaced = false;
function moveGlider(){
  var g = $("#glider"), b = $("#tab-" + ui.tab);
  if(!g || !b) return;
  if(!gliderPlaced) g.style.transition = "none";   /* nicht beim Laden einfahren */
  g.style.width = b.offsetWidth + "px";
  g.style.transform = "translateX(" + b.offsetLeft + "px)";
  if(!gliderPlaced){
    void g.offsetWidth;
    g.style.transition = "";
    gliderPlaced = true;
  }
}

function setTab(name){
  var same = ui.tab === name;
  ui.tab = name;
  ["liste","sammel","maerkte"].forEach(function(t){
    var panel = $("#panel-" + t);
    panel.hidden = (t !== name);
    $("#tab-" + t).setAttribute("aria-selected", String(t === name));
    if(t === name && !same){
      panel.classList.remove("entering");
      void panel.offsetWidth;              /* Animation neu anstossen */
      panel.classList.add("entering");
    }
  });
  moveGlider();
  render();
}

function msg(id, text, bad){
  var el = $(id);
  if(!el) return;
  el.textContent = text;
  el.hidden = false;
  el.style.color = bad ? "var(--danger)" : "";
}

/* ---------- Klicks ---------- */
document.addEventListener("click", function(e){
  var t = e.target.closest("[data-act]");
  if(!t) return;
  var act = t.dataset.act, id = t.dataset.id;

  if(act === "filter"){ ui.filter = id; render(); }

  else if(act === "toggle"){
    var it = item(id);
    if(!it) return;
    it.done = !it.done;
    put("items", it);
    /* Nur die angefasste Zeile umschalten. Ein voller Neuaufbau der Liste
       ruckelt sichtbar und liesse die Zeile unter dem Finger wegspringen. */
    var li = t.closest("li.item");
    if(li) li.classList.toggle("done", it.done);
    t.setAttribute("aria-pressed", String(it.done));
    renderHead(); renderChips(); renderCounts();
  }
  else if(act === "del-item"){ drop("items", id); render(); }

  else if(act === "clear-done"){
    db.items.filter(function(i){
      if(!i.done) return false;
      if(id === "all") return true;
      return (market(i.marketId) ? i.marketId : "none") === id;
    }).forEach(function(i){ drop("items", i.id); });
    render();
  }

  else if(act === "cat-del"){
    if(ui.picked === id) ui.picked = null;
    drop("catalog", id); render();
  }

  else if(act === "cat-clear"){
    if(!confirm("Alle " + db.catalog.length + " Produkte aus der Sammelliste löschen? Die Einkaufsliste bleibt.")) return;
    ui.picked = null;
    db.catalog.slice().forEach(function(c){ drop("catalog", c.id); });
    render();
  }

  else if(act === "pick"){
    ui.picked = (ui.picked === id) ? null : id;
    renderCatalog(); renderSammelMarkets();
  }

  else if(act === "assign"){
    if(!ui.picked) return;
    var cat = db.catalog.filter(function(c){ return c.id === ui.picked; })[0];
    ui.picked = null;
    if(cat) addToMarket(cat.name, id);
    render();
  }


  else if(act === "remove-item"){ drop("items", id); render(); }

  else if(act === "color"){
    var mk = market(id);
    if(!mk || mk.color === t.dataset.color) return;
    mk.color = t.dataset.color;
    put("markets", mk);
    /* Nur den Punkt umfaerben. Ein Neuaufbau der Zeile wuerde die
       Animation im selben Moment wieder wegwerfen. */
    var row = t.closest(".mrow");
    var dot = row.querySelector(".dot");
    dot.style.background = mk.color;
    row.querySelectorAll(".sw").forEach(function(sw){
      sw.setAttribute("aria-pressed", String(sw.dataset.color === mk.color));
    });
    dot.classList.remove("pulse");
    void dot.offsetWidth;
    dot.classList.add("pulse");
  }
  else if(act === "del-market"){
    var m = market(id);
    if(!m) return;
    var n = db.items.filter(function(i){ return i.marketId === id; }).length;
    if(!confirm('„' + m.name + '" löschen?' + (n ? " " + n + " Produkt(e) werden entfernt." : ""))) return;
    db.items.filter(function(i){ return i.marketId === id; }).forEach(function(i){ drop("items", i.id); });
    drop("markets", id);
    if(ui.filter === id) ui.filter = "all";
    render();
  }

  else if(act === "export"){
    $("#backup").value = JSON.stringify({markets:db.markets, catalog:db.catalog, items:db.items});
    msg("#backup-msg", "Text markieren und kopieren.");
  }
  else if(act === "import"){
    try {
      var d = JSON.parse($("#backup").value);
      if(!d.markets || !d.items) throw new Error("unvollständig");
      db.markets = d.markets; db.catalog = d.catalog || []; db.items = d.items;
      db.markets.forEach(function(m, i){ if(typeof m.order !== "number") m.order = i; });
      db.items.forEach(function(i, n){ if(typeof i.createdAt !== "number") i.createdAt = n; });
      save(); SYNC.pushAll(); render();
      msg("#backup-msg", "Daten übernommen.");
    } catch(err){ msg("#backup-msg", "Der Text ist keine gültige Sicherung. Bitte die komplette Zeile einfügen.", true); }
  }
  else if(act === "reset"){
    var shared = SYNC.isOn();
    if(!confirm("Alle Listen, Produkte und Märkte löschen?" + (shared ? " Das trifft auch die anderen Geräte." : ""))) return;
    db.markets = []; db.catalog = []; db.items = [];
    save(); SYNC.wipe(); ui.filter = "all"; render();
    msg("#backup-msg", "Alles geleert.");
  }

  else if(act === "sync-save"){
    var err = SYNC.saveConfig($("#sync-cfg").value);
    if(err){ renderSync(); msg("#sync-msg", err, true); return; }
    SYNC.start(); render();
  }
  else if(act === "sync-copy"){
    var field = $("#sync-link");
    field.select();
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(field.value).then(function(){ msg("#sync-msg", "Link kopiert."); },
        function(){ msg("#sync-msg", "Kopieren ging nicht, Link ist markiert."); });
    } else { msg("#sync-msg", "Link ist markiert, jetzt kopieren."); }
  }
  else if(act === "sync-join"){
    var err2 = SYNC.join($("#sync-join").value);
    if(err2) msg("#sync-msg", err2, true); else render();
  }
  else if(act === "sync-new"){
    if(!confirm("Neue, leere gemeinsame Liste starten? Die alte bleibt bestehen, dieses Gerät ist dann aber nicht mehr darin.")) return;
    location.hash = "";
    try { localStorage.removeItem("marktliste.code"); } catch(e){}
    location.reload();
  }
});

document.querySelector(".tabs").addEventListener("click", function(e){
  var b = e.target.closest("[data-tab]");
  if(b) setTab(b.dataset.tab);
});

/* ---------- Auswahlfelder ---------- */
document.addEventListener("change", function(e){
  var t = e.target.closest("[data-act]");
  if(!t) return;
  var act = t.dataset.act, id = t.dataset.id;
  if(act === "rename"){
    var m = market(id);
    if(!m) return;
    var name = t.value.trim();
    if(!name){ renderMarkets(); return; }
    m.name = name; put("markets", m); render();
  }
});

/* ---------- Formulare ---------- */
$("#cat-form").addEventListener("submit", function(e){
  e.preventDefault();
  var name = $("#cat-name").value.trim();
  if(!name) return;
  if(!db.catalog.some(function(c){ return c.name.toLowerCase() === name.toLowerCase(); })){
    var fresh = {id:uid(), name:name};
    put("catalog", fresh);
    ui.fresh = fresh.id;
  }
  $("#cat-name").value = "";
  render(); $("#cat-name").focus();
});

$("#market-form").addEventListener("submit", function(e){
  e.preventDefault();
  var name = $("#market-name").value.trim();
  if(!name) return;
  var mk = {id:uid(), name:name, color:COLORS[db.markets.length % COLORS.length], order:db.markets.length};
  put("markets", mk);
  ui.fresh = mk.id;
  $("#market-name").value = "";
  render();
});

window.addEventListener("hashchange", function(){
  if(SYNC.configured() && !SYNC.isOn()) SYNC.start();
});

window.addEventListener("resize", moveGlider);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(moveGlider);

/* ---------- Ziehen mit Zeigergeraet: Maus, Finger, Stift ----------
   Kein HTML5-Drag: das feuert auf Touch nicht. Ein Klon haengt an der
   Zeigerposition und laeuft ihr per Feder hinterher, die Neigung kommt aus
   der Restdistanz. Alles nur transform, damit kein Layout neu rechnet. */
var DRAG = (function(){
  var SLOP = 7;          /* so weit ziehen, bis aus Tippen ein Ziehen wird */
  var STIFF = 0.28;      /* Federhaerte des Nachlaufs */
  var TILT = 1.1;        /* Grad Neigung je Pixel Rueckstand */

  var st = null, frame = 0;

  function zoneAt(x, y){
    var el = document.elementFromPoint(x, y);
    return el ? el.closest("[data-drop]") : null;
  }

  function tick(){
    frame = 0;
    if(!st || !st.active) return;
    st.x += (st.tx - st.x) * STIFF;
    st.y += (st.ty - st.y) * STIFF;
    var lag = st.tx - st.x;
    var rot = Math.max(-16, Math.min(16, lag * TILT));
    st.ghost.style.transform =
      "translate3d(" + (st.x - st.gx) + "px," + (st.y - st.gy) + "px,0) rotate(" + rot + "deg)";
    if(Math.abs(lag) > 0.4 || Math.abs(st.ty - st.y) > 0.4) queue();
  }
  function queue(){ if(!frame) frame = requestAnimationFrame(tick); }

  function begin(){
    /* Erst jetzt einfangen. Frueher gesetzt, landet auch ein blosser Klick
       auf dem Traeger statt auf dem Knopf darin und das Antippen faellt aus. */
    try { st.node.setPointerCapture(st.pid); } catch(e){}
    var r = st.node.getBoundingClientRect();
    var g = st.node.cloneNode(true);
    g.className = st.node.className + " dragfly";
    g.style.cssText = "position:fixed;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;margin:0";
    document.body.appendChild(g);
    st.ghost = g;
    st.gx = st.x; st.gy = st.y;      /* Zeigerposition beim Aufnehmen */
    st.active = true;
    st.node.classList.add("lifted");
    document.body.classList.add("dragging-now");
    queue();
  }

  function land(zone, done){
    var g = st.ghost, node = st.node;
    if(!g) return done();
    if(zone){
      var r = zone.getBoundingClientRect();
      var gr = g.getBoundingClientRect();
      g.style.transition = "transform .22s cubic-bezier(.4,0,.2,1),opacity .22s ease";
      g.style.transform =
        "translate3d(" + (r.left + r.width / 2 - gr.left - gr.width / 2) + "px," +
        (r.top + Math.min(26, r.height / 2) - gr.top) + "px,0) scale(.55)";
      g.style.opacity = "0";
      zone.classList.add("caught");
      setTimeout(function(){ zone.classList.remove("caught"); }, 360);
    } else {
      g.style.transition = "transform .3s cubic-bezier(.2,1.3,.5,1)";
      g.style.transform = "translate3d(0,0,0) rotate(0deg)";
    }
    setTimeout(function(){
      if(g.parentNode) g.parentNode.removeChild(g);
      node.classList.remove("lifted");
      done();
    }, zone ? 210 : 290);
  }

  /* Nach dem Loslassen schickt der Browser noch einen Klick auf das
     aufgenommene Element. Ohne das hier waehlt ein Zug das Produkt zusaetzlich aus. */
  function swallowClick(){
    var eat = function(ev){ ev.stopPropagation(); ev.preventDefault(); done(); };
    var done = function(){
      clearTimeout(timer);
      window.removeEventListener("click", eat, true);
    };
    var timer = setTimeout(done, 350);
    window.addEventListener("click", eat, true);
  }

  function stop(){
    if(frame){ cancelAnimationFrame(frame); frame = 0; }
    document.body.classList.remove("dragging-now");
    if(st && st.zone) st.zone.classList.remove("over");
  }

  document.addEventListener("pointerdown", function(e){
    if(e.button != null && e.button !== 0) return;
    /* Nur echte Bedienelemente sperren. Der Produktname ist selbst ein
       Knopf und muss greifbar bleiben, sonst laesst sich nichts ziehen. */
    if(e.target.closest(".drop, .x, .tick, .btn, select, input, textarea, a")) return;
    var node = e.target.closest("[data-drag]");
    if(!node) return;
    st = {node:node, kind:node.dataset.drag, id:node.dataset.id,
          x:e.clientX, y:e.clientY, tx:e.clientX, ty:e.clientY,
          x0:e.clientX, y0:e.clientY, active:false, zone:null, pid:e.pointerId,
          touch:e.pointerType === "touch", hold:0};
    /* Am Finger erst nach kurzem Halten aufnehmen, sonst frisst das Ziehen
       jeden Wischer, mit dem die Seite eigentlich gescrollt werden soll. */
    if(st.touch) st.hold = setTimeout(function(){
      if(!st || st.active) return;
      st.hold = 0;
      begin();
      if(navigator.vibrate) try { navigator.vibrate(12); } catch(err){}
    }, 220);
  });

  document.addEventListener("pointermove", function(e){
    if(!st || e.pointerId !== st.pid) return;
    st.tx = e.clientX; st.ty = e.clientY;
    if(!st.active){
      var far = Math.abs(e.clientX - st.x0) >= SLOP || Math.abs(e.clientY - st.y0) >= SLOP;
      if(!far) return;
      if(st.touch){ clearTimeout(st.hold); st = null; return; }  /* das war Scrollen */
      begin();
    }
    e.preventDefault();
    var z = zoneAt(e.clientX, e.clientY);
    if(z !== st.zone){
      if(st.zone) st.zone.classList.remove("over");
      if(z) z.classList.add("over");
      st.zone = z;
    }
    queue();
  });

  function finish(e){
    if(!st || e.pointerId !== st.pid) return;
    var s = st;
    clearTimeout(s.hold);
    st = null;
    if(!s.active){ stop(); return; }          /* war nur ein Tippen */
    swallowClick();
    var zone = s.zone;
    st = s;                                    /* land() braucht den Zustand */
    land(zone, function(){
      st = null;
      if(!zone) return;
      var target = zone.dataset.drop;
      if(s.kind === "product"){
        var cat = db.catalog.filter(function(c){ return c.id === s.id; })[0];
        if(cat) addToMarket(cat.name, target);
      } else if(s.kind === "item"){
        var it = item(s.id);
        if(it){ it.marketId = target || null; put("items", it); }
      }
      render();
    });
    stop();
  }
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", finish);

  return {busy: function(){ return !!(st && st.active); }};
})();

setTab("liste");
SYNC.start();
})();
