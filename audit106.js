"use strict";
// audit106.js - re-patch acr verify callbacks (lost on restart) + VDCurl callback.
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
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
    post("/p106_diag", out);
    post("/p106_done", { started: out.started });
} else {
    out.maps = sh("cat /proc/" + pid + "/maps | grep VDCurl | head -3", 300);
    var vdBase = null;
    out.maps.split("\n").forEach(function (L) {
        var m = L.match(/^([0-9a-f]+)-[0-9a-f]+ r-xp 00000000 .*libVDCurl/);
        if (m && !vdBase) vdBase = parseInt(m[1], 16);
    });

    sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);

    var T = [
        { name: "AcrControlVerifyCertCallback", addr: 0x96c08 },
        { name: "lws_VerifyCertCallback", addr: 0x97c84 }
    ];
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
    post("/p106_patch", out);
    post("/p106_done", { started: out.started });
}
