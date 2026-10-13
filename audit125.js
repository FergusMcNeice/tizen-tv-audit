"use strict";
// audit125.js - capture the exact ACR beacon payload (binary) from acr heap.
// Dumps rw heap, then for each key marker (psid/device_id/recog_content/raws/fp_ver/
// matchInfo/POST) grabs a 3KB binary window (od -v, no '*' collapse) = the exact bytes
// of the outgoing telemetry / query structure. Also grabs full HTTP messages with bodies.
// Polled frequently during activity to catch the transient beacon. POSTs to PC :9999.
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64", PORT = 9999;

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: to || 20000 }).slice(0, cap || 500000); }
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

function scrape(tag) {
    var pid = findPid();
    if (!pid) { post("/p125_diag", { tag: tag, note: "no acr pid" }); return; }

    // dump rw heap
    sh("cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; " +
       "> /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); " +
       "dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; " +
       "done < /tmp/.amap; wc -c /tmp/acr_mem.bin", 200, 30000);

    var out = { kind: "beacon", tag: tag, ts: new Date().toISOString(), acr_pid: pid, wins: {} };
    var marks = ["psid", "device_id", "recog_content", "raws", "fp_ver", "matchInfo", "POST ", "uduration", "tv_source", "bypassData"];
    for (var i = 0; i < marks.length; i++) {
        var mk = marks[i];
        var offs = sh("grep -aob -e '" + mk + "' /tmp/acr_mem.bin 2>/dev/null | head -2 | cut -d: -f1", 2000, 12000);
        var wins = [];
        offs.split("\n").forEach(function (ostr) {
            var off = parseInt(ostr.trim(), 10);
            if (isNaN(off)) return;
            var start = off - 200; if (start < 0) start = 0;
            // od -v avoids '*' repeat-collapse; 3KB window
            var hex = sh("dd if=/tmp/acr_mem.bin bs=1 skip=" + start + " count=3000 2>/dev/null | od -An -v -tx1 | tr -d ' \\n'", 8000, 10000);
            wins.push({ off: off, start: start, hex: hex.trim() });
        });
        out.wins[mk] = wins;
    }
    // full HTTP messages (request line + headers + body)
    out.http = sh("tr -c '\\40-\\176' '\\n' < /tmp/acr_mem.bin | grep -aE -i '^(GET |POST |HTTP/1.)' | sort -u | head -40", 12000, 15000);

    post("/p125_" + tag, out);
}

post("/p125_boot", { kind: "diag", ts: new Date().toISOString(),
    fields: { note: "audit125 beacon capture up", node: process.version, pid: process.pid } });
scrape("t0");
setTimeout(function () { scrape("t10"); }, 10000);
setTimeout(function () { scrape("t25"); }, 25000);
setTimeout(function () { scrape("t45"); }, 45000);
setTimeout(function () { scrape("t70"); }, 70000);
setTimeout(function () { scrape("t100"); }, 100000);
setTimeout(function () { scrape("t140"); }, 140000);
console.log("audit125 up");
