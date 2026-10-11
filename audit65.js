"use strict";
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

function sh(cmd, cap, to) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: to || 30000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.scan = sh("kill $(pidof acr) 2>/dev/null; touch /tmp/acr/path_exists/acr_ready; RES=''; for i in $(seq 1 12); do PID=$(pidof acr | awk '{print $1}'); if [ -n \"$PID\" ]; then H=$(grep '\\[heap\\]' /proc/$PID/maps | cut -d- -f1 | head -1); if [ -n \"$H\" ]; then X=$(dd if=/proc/$PID/mem bs=4096 skip=$((0x$H/4096)) count=200 2>/dev/null | grep -a -o -E '.{0,50}(device_id|recog_content|query_info|fp_ver|uduration|matchInfo|contentId|firmware_version|hdmi_info|tz_history|sorconfig|raws).{0,320}' | head -6); if [ -n \"$X\" ]; then RES=\"$RES\"\"$X\"; fi; fi; fi; sleep 3; done; echo \"$RES\" | sort -u | head -25", 20000, 200000);
post("/acr65", out);
post("/acr65_done", { started: out.started });
