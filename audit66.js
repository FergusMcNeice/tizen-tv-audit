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
out.scan = sh("kill $(pidof acr) 2>/dev/null; touch /tmp/acr/path_exists/acr_ready; RES=''; for i in $(seq 1 90); do PID=$(pidof acr | awk '{print $1}'); if [ -n \"$PID\" ]; then for H in $(grep ' rw' /proc/$PID/maps | cut -d- -f1 | head -12); do X=$(dd if=/proc/$PID/mem bs=4096 skip=$((0x$H/4096)) count=300 2>/dev/null | grep -a -o -E '.{0,50}(device_id|recog_content|query_info|fp_ver|uduration|matchInfo|contentId|firmware_version|hdmi_info|tz_history|sorconfig).{0,320}' | head -4); if [ -n \"$X\" ]; then RES=\"$RES\"\"$X\"; fi; done; fi; if [ $(echo \"$RES\" | wc -c) -gt 2000 ]; then break; fi; sleep 5; done; echo \"$RES\" | sort -u | head -30", 25000, 560000);
post("/acr66", out);
post("/acr66_done", { started: out.started });
