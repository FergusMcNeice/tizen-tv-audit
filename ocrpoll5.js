"use strict";
// ocrpoll5.js - CLEAN OCR feed via the recognition service's D-Bus API (samsung.tizen.CrsApi).
// No heap scraping: reads the service's own recognition results.
//   RAW   = GetProgramTitle / GetChannelName (the text OCR read off the screen)
//   IDENT = GetChannelNumber, title source, statuses, GetContentsInfo
//   TX    = pre-encryption ACR payload (acr heap JSON scan, low frequency)
var net = require("net");
var cp = require("child_process");

var PC = "192.168.1.64";
var VIEW_PORT = 19999;
var DEST = "samsung.tizen.CrsApi";
var OBJ = "/samsung/tizen/CrsApi";

var queue = [];
var sock = null;
function send(ev) {
    if (queue.length > 300) queue.shift();
    queue.push(JSON.stringify(ev) + "\n");
    flush();
}
function flush() {
    if (!sock || sock.destroyed) {
        try {
            sock = net.connect(VIEW_PORT, PC);
            sock.on("error", function () { sock = null; });
            sock.on("connect", function () { while (queue.length) { try { sock.write(queue.shift()); } catch (e) { break; } } });
        } catch (e) { sock = null; return; }
    }
    while (queue.length) { try { sock.write(queue.shift()); } catch (e) { break; } }
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 8000 }).slice(0, cap || 2000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function crs(method) {
    var r = sh("gdbus call --system --dest " + DEST + " --object-path " + OBJ +
               " --method " + DEST + "." + method, 1500);
    // gdbus prints like ('value',) or (12,) or (1, 2)
    var m = /^\((.*)\)\s*$/s.exec(r.trim());
    return m ? m[1].replace(/^'|'$/g, "").trim() : r.trim().slice(0, 200);
}

var last = {};
var tick = 0;

function poll() {
    tick++;
    var now = new Date().toISOString().slice(11, 19);
    var name = crs("GetChannelName");
    var num = crs("GetChannelNumber");
    var title = crs("GetProgramTitle");
    var tsrc = crs("GetProgramTitleSource");
    var recog = crs("GetRecognitionStatus");
    var screen = crs("GetScreenStatus");
    var scroll = crs("GetChannelScrollStatus");

    // RAW: the text OCR actually read (title + channel name), on change
    if (title && title !== last.title) {
        send({ kind: "raw", ts: now, text: title, fields: { src: "crs", what: "program_title" } });
        last.title = title;
    }
    if (name && name !== last.name) {
        send({ kind: "raw", ts: now, text: name, fields: { src: "crs", what: "channel_name" } });
        last.name = name;
    }

    // IDENT: classification/status
    var ident = { src: "crs", channel_number: num, channel_name: name,
                  program_title: title, title_source: tsrc,
                  recognition_status: recog, screen_status: screen, scroll: scroll };
    if (JSON.stringify(ident) !== JSON.stringify(last.ident)) {
        send({ kind: "ident", ts: now, fields: ident });
        last.ident = ident;
    }

    // every ~10 polls: full contents info + ACR payload scan
    if (tick % 10 === 0) {
        send({ kind: "ident", ts: now, fields: { heartbeat: tick, recognition_status: recog, contents_info: crs("GetContentsInfo").slice(0, 500) } });
        scanAcr(now);
    }
}

function scanAcr(now) {
    var pid = 0;
    var p = sh("pgrep -f '/usr/bin/acr$'", 100);
    pid = parseInt(p, 10);
    if (!pid) return;
    var regs = sh("cat /proc/" + pid + "/maps | awk '/\\[heap\\]/{print $1}'", 2000);
    var seg = regs.split("\n")[0];
    if (!seg) return;
    var parts = seg.split("-");
    var start = parseInt(parts[0], 16), end = parseInt(parts[1], 16);
    if (!(end > start)) return;
    var data;
    try {
        data = cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + Math.floor(start / 4096) +
            " count=" + Math.ceil((end - start) / 4096) + " 2>/dev/null", { timeout: 8000 });
    } catch (e) { return; }
    var cur = "", hits = [];
    for (var i = 0; i < data.length; i++) {
        var c = data[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else {
            if (cur.length > 30 && cur.indexOf("{") >= 0 &&
                (cur.indexOf("channelName") >= 0 || cur.indexOf("psid") >= 0 ||
                 cur.indexOf("contentId") >= 0 || cur.indexOf("recog_content") >= 0)) {
                hits.push(cur);
            }
            cur = "";
        }
    }
    for (var j = 0; j < hits.length; j++) {
        send({ kind: "tx", ts: now, text: hits[j].slice(0, 1500), fields: { src: "acr_heap", len: hits[j].length } });
    }
}

send({ kind: "ident", ts: "boot", fields: { note: "crsapi poller started", dest: DEST, obj: OBJ } });

setInterval(function () {
    try { poll(); } catch (e) {
        send({ kind: "ident", ts: "err", fields: { poll_error: String(e && e.message || e) } });
    }
}, 2000);

console.log("crsapi poller armed");
