"use strict";
// audit123.js - FAST ACR plaintext scraper (root, dd /proc/<pid>/mem).
// Single efficient pass per rw region:
//   - extract printable ASCII runs (index-based, no O(n^2) concat)
//   - keep runs containing ACR/HTTP/JSON markers
//   - for each kept run, also grab surrounding raw hex (exact bytes)
// Catches TX (pre-encryption) + RX (post-decryption) plaintext. Polled repeatedly.
// node 4.4-safe. POSTs to PC :9999 -> capture_p123_*.json
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
        req.write(data); req.end();
    } catch (e) {}
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 200000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function ddBuf(pid, start, len) {
    var skipPages = Math.floor(start / 4096), countPages = Math.ceil(len / 4096);
    try {
        return cp.execSync("dd if=/proc/" + pid + "/mem bs=4096 skip=" + skipPages + " count=" + countPages +
            " 2>/dev/null", { timeout: 12000, maxBuffer: 32 * 1024 * 1024 });
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
        if (b > a) regs.push({ start: a, end: Math.min(b, a + 4 * 1024 * 1024) });
    });
    return regs.slice(0, 30);
}

// broad marker list - a run must contain one to be kept
var MARKERS = ["device_id", "deviceId", "deviceid", "psid", "recog", "raws", "fp_ver",
    "matchInfo", "contentId", "channelId", "programId", "programName", "channelName",
    "query_interval", "sorconfig", "MatchingServer", "AdQuery", "fingerprint",
    "samsung", "Samsung", "samsungacr", "log-ingestion", "samsungqbe", "samsungcloud",
    "tv_source", "tv_ch", "hdmi", "viewing", "session", "content_type", "Content-Type",
    "POST ", "GET /", "HTTP/1", "Host:", "ser-Agent", "application/json", "bypassData",
    "startTime", "mediaTime", "engineType", "uduration", "query_sum", "try_cnt",
    "acr", "ACR", "type", "version", "device", "channel", "content"];

function interesting(s) {
    for (var i = 0; i < MARKERS.length; i++) if (s.indexOf(MARKERS[i]) >= 0) return true;
    return false;
}
function hexwin(buf, s, e) {
    if (s < 0) s = 0; if (e > buf.length) e = buf.length;
    var h = "";
    for (var i = s; i < e; i++) { var x = buf[i].toString(16); h += (x.length < 2 ? "0" : "") + x; }
    return h;
}

var seen = {};
var collected = { strings: [], contexts: [], https: [] };

function scrape(tag) {
    var pid = findPid();
    if (!pid) { post("/p123_diag", { tag: tag, note: "no acr pid" }); return; }
    var regs = regions(pid);
    var counts = { runs: 0, kept: 0, http: 0 };
    for (var r = 0; r < regs.length; r++) {
        var reg = regs[r];
        var data = ddBuf(pid, reg.start, reg.end - reg.start);
        if (!data || !data.length) continue;

        // one-pass printable-run extraction using index slicing (fast)
        var runStart = -1;
        for (var i = 0; i <= data.length; i++) {
            var isP = i < data.length && data[i] >= 32 && data[i] < 127;
            if (isP) {
                if (runStart < 0) runStart = i;
            } else {
                if (runStart >= 0) {
                    var len = i - runStart;
                    if (len >= 6) {
                        counts.runs++;
                        var s = data.slice(runStart, i).toString("latin1");
                        if (interesting(s)) {
                            var key = s.slice(0, 100);
                            if (!seen[key]) {
                                seen[key] = 1;
                                counts.kept++;
                                if (collected.strings.length < 800) {
                                    collected.strings.push(s.slice(0, 600));
                                    collected.contexts.push({
                                        va: "0x" + (reg.start + runStart).toString(16),
                                        ascii: s.slice(0, 300),
                                        hex: hexwin(data, runStart, runStart + Math.min(len, 120))
                                    });
                                }
                            }
                        }
                    }
                    runStart = -1;
                }
            }
        }

        // HTTP message heads
        for (var h = 0; h < 3; h++) {
            var pat = h === 0 ? "POST " : (h === 1 ? "HTTP/1." : "GET /");
            var idx = data.indexOf(pat);
            if (idx >= 0) {
                var hs = data.slice(idx, idx + 300).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
                var hk = "H" + hs.slice(0, 60);
                if (!seen[hk]) { seen[hk] = 1; counts.http++; if (collected.https.length < 80) collected.https.push(hs); }
            }
        }
    }
    post("/p123_" + tag, {
        kind: "flush", tag: tag, ts: new Date().toISOString(), acr_pid: pid,
        counts: counts, strings: collected.strings.slice(0, 250),
        contexts: collected.contexts.slice(0, 150), https: collected.https.slice(0, 40)
    });
}

post("/p123_boot", { kind: "diag", ts: new Date().toISOString(),
    fields: { note: "audit123 fast plaintext scraper up", node: process.version, pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t15"); }, 15000);
setTimeout(function () { scrape("t35"); }, 35000);
setTimeout(function () { scrape("t60"); }, 60000);
setTimeout(function () { scrape("t90"); }, 90000);
setTimeout(function () { scrape("t120"); }, 120000);
setTimeout(function () { scrape("t180"); }, 180000);
setTimeout(function () { scrape("t240"); }, 240000);
console.log("audit123 up");
