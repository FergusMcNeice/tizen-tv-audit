"use strict";
// audit124.js - shell-based ACR plaintext extractor (root).
// 1. dump acr rw heap to /tmp/acr_mem.bin (proven shell loop - fast)
// 2. extract printable strings via shell tr/grep (fast, not Node byte-loop)
// 3. filter for ACR / HTTP / JSON markers, POST the plaintext to PC :9999
// Repeats at intervals to catch the transient TX. node 4.4-safe.
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
function sh(cmd, cap, to) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: to || 20000 }).slice(0, cap || 400000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
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

// marker regex for the shell grep -E filter
var RE = "device_?[Ii]d|psid|recog|raws|fp_ver|matchInfo|contentId|channelId|programId|programName|channelName|query_interval|sorconfig|MatchingServer|AdQuery|fingerprint|samsungacr|log-ingestion|samsungqbe|samsungcloud|tv_source|tv_ch|hdmi|viewing|bypassData|startTime|mediaTime|engineType|uduration|query_sum|try_cnt|POST |GET /|HTTP/1|Host:|application/json|Content-Type|User-Agent|session_?[Ii]d|deviceId";

function scrape(tag) {
    var pid = findPid();
    if (!pid) { post("/p124_diag", { tag: tag, note: "no acr pid" }); return; }

    // 1. dump rw heap (proven shell loop)
    var dump = sh("cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; " +
        "> /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); " +
        "dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; " +
        "done < /tmp/.amap; wc -c /tmp/acr_mem.bin", 500, 30000);

    // 2. extract printable runs, filter for markers (shell, fast)
    var strs = sh("tr -c '\\40-\\176' '\\n' < /tmp/acr_mem.bin | grep -aE -i '" + RE + "' | sort -u | head -500", 200000, 30000);
    var lines = strs.split("\n").map(function (x) { return x.trim(); })
        .filter(function (x) { return x.length >= 4 && x.length <= 600; });

    // 3. exact bytes around a few key markers (for byte-exact content)
    var ctx = {};
    ["device_id", "psid", "recog_content", "raws", "fp_ver", "matchInfo", "POST ", "Host:"].forEach(function (mk) {
        var o = sh("grep -aob -e '" + mk + "' /tmp/acr_mem.bin 2>/dev/null | head -3 | cut -d: -f1", 2000, 15000);
        o.split("\n").forEach(function (offstr) {
            var off = parseInt(offstr.trim(), 10);
            if (isNaN(off)) return;
            var hx = sh("dd if=/tmp/acr_mem.bin bs=1 skip=" + Math.max(0, off - 40) + " count=200 2>/dev/null | od -An -tx1 | tr -d ' \\n'", 600, 8000);
            var asc = sh("dd if=/tmp/acr_mem.bin bs=1 skip=" + Math.max(0, off - 40) + " count=200 2>/dev/null | tr -c '\\40-\\176' '.'", 400, 8000);
            if (!ctx[mk]) ctx[mk] = [];
            ctx[mk].push({ off: off, hex: hx.trim(), ascii: asc.trim() });
        });
    });

    post("/p124_" + tag, {
        kind: "flush", tag: tag, ts: new Date().toISOString(), acr_pid: pid,
        dump: dump.trim(), n_strings: lines.length,
        strings: lines.slice(0, 400), context: ctx
    });
}

post("/p124_boot", { kind: "diag", ts: new Date().toISOString(),
    fields: { note: "audit124 shell plaintext extractor up", node: process.version, pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t20"); }, 20000);
setTimeout(function () { scrape("t50"); }, 50000);
setTimeout(function () { scrape("t90"); }, 90000);
setTimeout(function () { scrape("t150"); }, 150000);
setTimeout(function () { scrape("t210"); }, 210000);
console.log("audit124 up");
