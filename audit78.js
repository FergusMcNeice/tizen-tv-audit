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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var DMR = "/usr/apps/dmr_service_app/bin/dmr";
var out = {};
out.started = new Date().toISOString();
out.has_strings = sh("which strings; strings --version 2>&1 | head -2");

// grep -a on the binary: gate + launch + player dependency strings
out.gate = sh("grep -a -o -E '.{0,30}Transition not available.{0,30}' " + DMR + " | head -5", 2000);
out.gate2 = sh("grep -a -o -E '.{0,25}(701|NOT_IMPLEMENTED|Transition).{0,25}' " + DMR + " | head -12", 2500);
out.attach = sh("grep -a -o -E '.{0,20}AttachPlayer.{0,40}' " + DMR + " | head -8", 2500);
out.launch = sh("grep -a -o -E '.{0,25}(launch|Launch|LAUNCH|mycontents|volt|player_instance|Attach).{0,35}' " + DMR + " | head -25", 5000);
out.appids = sh("grep -a -o -E '(org\\.[a-zA-Z0-9_.]{3,40})' " + DMR + " | sort -u | head -30", 3000);

// dmr config / manifest
out.cfg = sh("find /usr/apps/dmr_service_app /opt/usr/apps -iname '*.xml' -o -iname '*.json' -o -iname '*.conf' -o -iname '*.ini' 2>/dev/null | head -15");
out.manifest = sh("cat /usr/apps/dmr_service_app/*.xml 2>/dev/null | head -40; ls /usr/apps/dmr_service_app/ 2>/dev/null");

// dlog: bounded with timeout, look for dmr activity
out.dlog1 = sh("timeout 6 dlogutil -s 2>/dev/null | grep -iE 'dmr|vddmr|AttachPlayer|SetAVTransport' | head -25", 3500);

post("/avt4", out);
post("/avt4_done", { started: out.started });
