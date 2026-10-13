"use strict";
// audit101.js - POST cert PEM to PC, search acr memory for cert modulus bytes.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function trim(s) { return (s || "").trim(); }

var out = {};
out.started = new Date().toISOString();

// 1. POST cert PEM
var certPem = "";
try { certPem = fs.readFileSync("/usr/lib/acr/cert/SamsungDeviceCertificate.pem", "utf8"); } catch (e) { certPem = "ERR " + e.message; }
post("/p101_cert", { pem: certPem });

// 2. extract modulus hex using openssl on TV (if available) or via base64+od
out.openssl = sh("which openssl 2>&1; openssl x509 -in /usr/lib/acr/cert/SamsungDeviceCertificate.pem -noout -modulus 2>&1 | head -3", 500);

// 3. dump cert DER and find modulus via od
var derB64 = certPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
out.b64len = derB64.length;

// write DER to file for analysis
sh("echo '" + derB64 + "' | base64 -d > /tmp/.certder 2>/dev/null; ls -la /tmp/.certder", 300);

// search for modulus in acr memory: use openssl to get modulus, then grep
out.mod_search = sh("openssl x509 -in /usr/lib/acr/cert/SamsungDeviceCertificate.pem -noout -modulus 2>/dev/null | sed 's/Modulus=//' | head -c 64 | sed 's/../\\\\x&/g' | xargs -0 printf > /tmp/.modbytes 2>/dev/null; od -A x -t x1 /tmp/.certder | head -30", 3000);

// 4. search for cert DER bytes in acr memory (find where cert is loaded)
out.cert_in_mem = sh("head -c 32 /tmp/.certder | od -A n -t x1 | tr -d ' \\n' | sed 's/../\\\\x&/g' | xargs -0 printf > /tmp/.certprefix 2>/dev/null; grep -aob -f /tmp/.certprefix /tmp/acr_mem2.bin 2>/dev/null | head -10", 2000);

// 5. dump raw bytes around cert locations in memory
out.mem_context = sh("for off in $(grep -aob -f /tmp/.certprefix /tmp/acr_mem2.bin 2>/dev/null | head -3 | cut -d: -f1); do echo \"=== offset $off\"; dd if=/tmp/acr_mem2.bin bs=1 skip=$((off-64)) count=256 2>/dev/null | od -A x -t x1z | head -20; done", 4000);

post("/p101_analysis", out);
post("/p101_done", { started: out.started });
