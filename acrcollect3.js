"use strict";
// acrcollect3.js - STORE-only ACR scraper, NON-BLOCKING (TizenBrew serviceFile,
// node 4.4-safe). Uses async cp.exec so node's event loop stays free and the
// periodic flush to the PC :9999 capture channel always fires. We capture the
// plaintext JSON in the ACRService heap (root, dd /proc/<pid>/mem):
//   RX  = Samsung -> TV (post-decryption): matchInfo + server-tunable config
//         (query_interval / AdQueryIntervalSec / sorconfigstring / threshold /
//          grid / bit layout / maths)  <- the real tunables you wanted
//   TX  = TV -> Samsung (pre-encryption): fingerprint output bits
//         (raws / recog_content / fp_ver) + device ids
//   CFG = a lifted config object (the tunable knobs)
// Retrieval: the :9999 POST flush lands as capture_ac3_*.json on the PC. No live
// TCP stream. node 4.4-safe (var/function/callbacks, no arrows/template/let/const).
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var PC = "192.168.1.64";
var HTTP_PORT = 9999;
var OUT = "/tmp/acr_dump.jsonl";

var TX_KEYS = ["raws", "recog_content", "fp_ver", "device_id", "psid", "uduration",
               "tv_source", "tv_ch", "hdmi_info", "viewing", "query_sum", "try_cnt"];
var RX_KEYS = ["matchInfo", "contentId", "channelId", "programId", "programName",
               "startTime", "mediaTime", "channelName", "bypassData", "engineType"];
var CFG_KEYS = ["query_interval", "AdQueryIntervalSec", "EdgeQueryIntervalSec",
                "refreshInterval", "DelayedServerQueryInterval", "query_mode",
                "sorconfigstring", "matching", "MatchingServerURL", "threshold",
                "thres", "grid", "bit", "layout", "sample", "fft", "mfcc", "lm_",
                "query_info", "query_freq"];

function post(tag, obj) {
    try {
        var data = JSON.stringify(obj);
        var req = http.request({ host: PC, port: HTTP_PORT, path: "/" + tag, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
            function (res) { try { res.resume(); } catch (e) {} });
        req.on("error", function () {});
        req.write(data);
        req.end();
    } catch (e) {}
}

function append(line) {
    try { fs.writeSync(fs.openSync(OUT, "a"), line + "\n"); } catch (e) {}
}

function has(s, keys) {
    for (var i = 0; i < keys.length; i++) if (s.indexOf(keys[i]) >= 0) return true;
    return false;
}
function classify(s) {
    var tx = has(s, TX_KEYS), rx = has(s, RX_KEYS), cfg = has(s, CFG_KEYS);
    if (tx && rx) return "BOTH";
    if (tx) return "TX";
    if (rx) return "RX";
    if (cfg) return "CFG";
    return "OTHER";
}
function pullFields(s, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) {
        var mm = new RegExp('"' + keys[i] + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|[-0-9.]+|true|false|null|\\{[^}]{0,400}\\}|\\[[^\\]]{0,400}\\])').exec(s);
        if (mm) out[keys[i]] = mm[1].slice(0, 400);
    }
    return out;
}
function jsonAt(buf, idx) {
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var i = idx; i < buf.length && i < idx + 200000; i++) {
        var c = buf[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === 92) esc = true;
            else if (c === 34) inStr = false;
            continue;
        }
        if (c === 34) { inStr = true; continue; }
        if (c === 123) depth++;
        else if (c === 125) { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > idx ? buf.slice(idx, end + 1) : null;
}

var seen = {};
var counts = { TX: 0, RX: 0, CFG: 0, BOTH: 0 };
var found = [];
var lastPid = null;
var busy = false;

function scanBuffer(data, now) {
    if (!data || !data.length) return;
    for (var i = 0; i < data.length; i++) {
        if (data[i] !== 123) continue;
        var j = jsonAt(data, i);
        if (!j || j.length < 40 || j.indexOf('"') < 0) continue;
        var dir = classify(j);
        if (dir === "OTHER") continue;
        var key = dir + "|" + j.slice(0, 200);
        if (seen[key]) continue;
        seen[key] = 1;
        if (counts[dir] !== undefined) counts[dir]++;
        var rec = { kind: "acr", ts: now, dir: dir, len: j.length,
                    fields: pullFields(j, TX_KEYS.concat(RX_KEYS, CFG_KEYS)),
                    text: j.slice(0, 8000) };
        append(JSON.stringify(rec));
        if (found.length < 600) found.push(rec);
        i += j.length > 2 ? j.length - 2 : 0;
    }
}

// async: find pid
function findPidAsync(cb) {
    cp.exec("ps -A 2>/dev/null | grep -i 'ACRService\\|/usr/bin/acr' | grep -v grep",
            { timeout: 8000, maxBuffer: 1024 * 1024 },
            function (err, stdout) {
        var pid = null;
        var out = stdout || "";
        out.split("\n").forEach(function (line) {
            var mm = line.trim().match(/^(\d+)/);
            if (mm && !pid) pid = parseInt(mm[1], 10);
        });
        cb(pid);
    });
}

// async: read maps -> list of rw regions (cap count + size)
function regionsAsync(pid, cb) {
    cp.exec("cat /proc/" + pid + "/maps", { timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
            function (err, stdout) {
        var regs = [];
        (stdout || "").split("\n").forEach(function (line) {
            var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
            if (!m) return;
            var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
            if (b > a) regs.push({ start: a, end: Math.min(b, a + 1024 * 1024) });
        });
        cb(regs.slice(0, 40));   // cap regions scanned per round
    });
}

// async: dd one region, scan it
function ddRegion(pid, reg, now, cb) {
    var skipPages = Math.floor(reg.start / 4096);
    var countPages = Math.ceil((reg.end - reg.start) / 4096);
    cp.exec("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages + " count=" + countPages + " 2>/dev/null",
            { timeout: 8000, maxBuffer: 16 * 1024 * 1024, encoding: "buffer" },
            function (err, stdout) {
        try { scanBuffer(stdout, now); } catch (e) {}
        cb();
    });
}

// one async scrape round: pid -> regions -> dd each in sequence
function scrapeRound(done) {
    findPidAsync(function (pid) {
        lastPid = pid;
        if (!pid) { done(); return; }
        regionsAsync(pid, function (regs) {
            var idx = 0;
            var now = new Date().toISOString();
            function next() {
                if (idx >= regs.length) { done(); return; }
                var reg = regs[idx++];
                ddRegion(pid, reg, now, next);
            }
            next();
        });
    });
}

// boot beacon
var boot = { kind: "diag", ts: new Date().toISOString(), fields: { note: "acrcollect3 up", node: process.version, pid: process.pid, out: OUT } };
append(JSON.stringify(boot));
post("ac3_boot", boot);

var ticks = 0;
var timer = setInterval(function () {
    ticks++;
    // guaranteed flush/heartbeat every 10s (loop is free because scraping is async)
    if (ticks % 7 === 0) {
        post("ac3_flush", { kind: "flush", ts: new Date().toISOString(),
             counts: counts, acr_pid: lastPid, total: found.length,
             blobs: found.slice(-60) });
    }
    // kick an async scrape round (don't let them stack)
    if (!busy) {
        busy = true;
        scrapeRound(function () { busy = false; });
    }
    if (ticks >= 3600) {
        clearInterval(timer);
        post("ac3_end", { kind: "end", ts: new Date().toISOString(), counts: counts, total: found.length });
    }
}, 1500);

console.log("acrcollect3 up");
