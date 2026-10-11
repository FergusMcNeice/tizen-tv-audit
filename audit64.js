"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + e.message); });
    req.write(data); req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

out.ddtest = sh("PID=$(pidof acr | awk '{print $1}'); A=$(grep 'heap' /proc/$PID/maps | head -1 | cut -d- -f1); echo HEAP=$A; dd if=/proc/$PID/mem bs=4096 skip=$((0x$A/4096)) count=2 2>&1 | base64 | head -c 120");
post("/acr64a", out);

var scan = sh("kill $(pidof acr) 2>/dev/null; touch /tmp/acr/path_exists/acr_ready; for i in $(seq 1 40); do PID=$(pidof acr | awk '{print $1}'); if [ -n \"$PID\" ]; then for REG in $(grep ' rw' /proc/$PID/maps | cut -d- -f1 | head -20); do dd if=/proc/$PID/mem bs=4096 skip=$((0x$REG/4096)) count=256 2>/dev/null | grep -a -o -E '.{0,40}(device_id|recog_content|query_info|fp_ver|uduration|matchInfo|contentId|firmware_version).{0,300}' | head -4; done; fi; sleep 2; done | sort -u | head -30", 30000);
post("/acr64b", { started: out.started, scan: scan });
post("/acr64_done", { started: out.started });
