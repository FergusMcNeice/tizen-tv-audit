"use strict";
// audit122.js - comprehensive ACR plaintext scraper (root, dd /proc/<pid>/mem).
// Captures the EXACT plaintext Samsung ACR traffic from the acr heap (pre-encryption
// TX and post-decryption RX). Unlike the JSON-only collector, this extracts:
//   * all printable ASCII strings (>=6 chars)
//   * complete JSON objects containing ACR field markers
//   * HTTP request/response messages (POST / GET / HTTP/1.)
//   * exact raw bytes around ACR field markers (device_id/psid/recog/raws/fp_ver/...)
// Polled repeatedly (audit36 one-shot setTimeout pattern) to catch the transient TX.
// Results POST to PC :9999 -> capture_p122_*.json. node 4.4-safe (var/no arrows/no literals).
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    try {
        var data = JSON.stringify(body);
        var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
            function (res) { try { res.resume(); } catch (e) {} });
        req.on("error", function () {});
        req.write(data);
        req.end();
    } catch (e) {}
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 200000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function ddBuf(pid, start, len) {
    var skipPages = Math.floor(start / 4096);
    var countPages = Math.ceil(len / 4096);
    try {
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages +
            " count=" + countPages + " 2>/dev/null", { timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
    } catch (e) { return null; }
}
function findPid() {
    var out = sh("ps -A 2>/dev/null | grep -i 'ACRService\\|/usr/bin/acr' | grep -v grep", 8000);
    var pid = null;
    out.split("\n").forEach(function (line) {
        var mm = line.trim().match(/^(\d+)/);
        if (mm && !pid) pid = parseInt(mm[1], 10);
    });
    return pid;
}
function regions(pid) {
    var txt = sh("cat /proc/" + pid + "/maps", 300000);
    var regs = [];
    txt.split("\n").forEach(function (line) {
        var m = line.match(/^([0-9a-f]+)-([0-9a-f]+)\s+rw/);
        if (!m) return;
        var a = parseInt(m[1], 16), b = parseInt(m[2], 16);
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 2 * 1024 * 1024) });
    });
    return regs.slice(0, 40);
}

// markers that indicate real ACR plaintext content
var MARKERS = ["device_id", "deviceId", "psid", "recog_content", "raws", "fp_ver",
    "matchInfo", "contentId", "channelId", "programId", "programName", "channelName",
    "query_interval", "sorconfigstring", "MatchingServerURL", "AdQueryInterval",
    "fingerprint", "acr", "ACR", "samsung", "Samsung", "samsungacr", "log-ingestion",
    "samsungqbe", "samsungcloud", "tv_source", "tv_ch", "hdmi_info", "viewing",
    "deviceid", "session_id", "content_type", "Content-Type", "POST ", "GET ",
    "HTTP/1.", "Host:", "user-agent", "User-Agent", "application/json", "bypassData",
    "startTime", "mediaTime", "engineType", "uduration", "query_sum", "try_cnt"];

function isPrint(c) { return c >= 32 && c < 127; }

// extract printable ASCII runs >= minLen
function extractStrings(buf, minLen) {
    var out = [];
    var cur = "";
    for (var i = 0; i < buf.length; i++) {
        if (isPrint(buf[i])) {
            cur += String.fromCharCode(buf[i]);
        } else {
            if (cur.length >= minLen) out.push(cur);
            cur = "";
        }
    }
    if (cur.length >= minLen) out.push(cur);
    return out;
}

function hasMarker(s) {
    for (var i = 0; i < MARKERS.length; i++) {
        if (s.indexOf(MARKERS[i]) >= 0) return true;
    }
    return false;
}

// extract a balanced {...} JSON object starting at idx (if any), max maxLen
function jsonAt(buf, idx, maxLen) {
    var depth = 0, inStr = false, esc = false, end = -1;
    var lim = Math.min(buf.length, idx + maxLen);
    for (var i = idx; i < lim; i++) {
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

// hex dump of a window, truncated
function hexwin(buf, off, len) {
    var s = off - len; if (s < 0) s = 0;
    var e = off + len; if (e > buf.length) e = buf.length;
    var h = "";
    for (var i = s; i < e; i++) {
        var x = buf[i].toString(16);
        if (x.length < 2) x = "0" + x;
        h += x;
    }
    return h;
}

var seenStr = {};
var seenCtx = {};
var collected = { strings: [], jsons: [], https: [], contexts: [] };

function scrape(tag) {
    var pid = findPid();
    if (!pid) { post("/p122_diag", { tag: tag, note: "no acr pid" }); return; }
    var regs = regions(pid);
    var counts = { strings: 0, marker: 0, json: 0, http: 0, ctx: 0 };
    for (var r = 0; r < regs.length; r++) {
        var reg = regs[r];
        var data = ddBuf(pid, reg.start, reg.end - reg.start);
        if (!data || !data.length) continue;

        // 1. strings + marker strings
        var strs = extractStrings(data, 6);
        for (var i = 0; i < strs.length; i++) {
            var s = strs[i];
            if (!hasMarker(s)) continue;
            if (seenStr[s]) continue;
            seenStr[s] = 1;
            counts.marker++;
            if (collected.strings.length < 600) collected.strings.push(s.slice(0, 500));
        }

        // 2. complete JSON objects (start with { and contain a marker)
        for (var j = 0; j < data.length; j++) {
            if (data[j] !== 123) continue;
            var jb = jsonAt(data, j, 8000);
            if (!jb || jb.length < 20) continue;
            var js = jb.toString("utf8");
            if (!hasMarker(js)) continue;
            if (seenStr["J" + js.slice(0, 120)]) continue;
            seenStr["J" + js.slice(0, 120)] = 1;
            counts.json++;
            if (collected.jsons.length < 300) collected.jsons.push(js.slice(0, 6000));
            j += jb.length > 2 ? jb.length - 2 : 0;
        }

        // 3. HTTP messages + exact marker context bytes
        for (var k = 0; k < MARKERS.length; k++) {
            var mk = MARKERS[k];
            var pos = 0;
            var found = 0;
            while (found < 3) {
                // search for marker in data (byte-wise via Buffer.indexOf)
                var idx = data.indexOf(mk, pos);
                if (idx < 0) break;
                found++;
                pos = idx + mk.length;
                var key = mk + "@" + ((reg.start + idx) & 0xfffff);
                if (seenCtx[key]) continue;
                seenCtx[key] = 1;
                counts.ctx++;
                if (collected.contexts.length < 400) {
                    collected.contexts.push({
                        marker: mk,
                        va: "0x" + (reg.start + idx).toString(16),
                        hex: hexwin(data, idx, 220),
                        ascii: data.slice(Math.max(0, idx - 80), idx + 160).toString("latin1").replace(/[^\x20-\x7e]/g, ".")
                    });
                }
            }
        }

        // 4. HTTP message starts (POST/GET/HTTP)
        for (var hpat = 0; hpat < 3; hpat++) {
            var pat = hpat === 0 ? "POST " : (hpat === 1 ? "HTTP/1." : "GET /");
            var hp = data.indexOf(pat);
            if (hp >= 0) {
                var hs = data.slice(hp, hp + 400).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
                if (!seenStr["H" + hs.slice(0, 80)]) {
                    seenStr["H" + hs.slice(0, 80)] = 1;
                    counts.http++;
                    if (collected.https.length < 200) collected.https.push(hs);
                }
            }
        }
    }
    post("/p122_" + tag, {
        kind: "flush", tag: tag, ts: new Date().toISOString(), acr_pid: pid,
        counts: counts, total_strings: collected.strings.length,
        strings: collected.strings.slice(0, 200),
        jsons: collected.jsons.slice(0, 60),
        https: collected.https.slice(0, 40),
        contexts: collected.contexts.slice(0, 120)
    });
}

// ---- audit36-style: synchronous first scrape, then one-shot setTimeouts ----
post("/p122_boot", { kind: "diag", ts: new Date().toISOString(),
    fields: { note: "audit122 plaintext scraper up", node: process.version, pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t15"); }, 15000);
setTimeout(function () { scrape("t35"); }, 35000);
setTimeout(function () { scrape("t60"); }, 60000);
setTimeout(function () { scrape("t90"); }, 90000);
setTimeout(function () { scrape("t120"); }, 120000);
setTimeout(function () { scrape("t180"); }, 180000);
setTimeout(function () { scrape("t240"); }, 240000);
console.log("audit122 up");
