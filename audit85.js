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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 4000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var SDK = "/home/owner/share/tmp/sdk_tools";

// stop any previous poller
sh("pkill -f ocrpoll.py");
out.pre = sh("pgrep -f ocrpoll.py; echo rc=$?");

// launch detached; log to the rw partition
out.launch = sh("nohup /usr/bin/python " + SDK + "/ocrpoll.py > /opt/usr/ocrpoll.log 2>&1 & echo started");

// give it a moment, then verify
out.pid = sh("sleep 3; pgrep -f ocrpoll.py");
out.log = sh("head -c 1500 /opt/usr/ocrpoll.log 2>&1");
out.memcheck = sh("/usr/bin/python -c \"f=open('/proc/1394/mem','rb'); f.seek(0x60000); print(repr(f.read(64))); f.close()\" 2>&1 | head -3");

post("/ocr_launch", out);
post("/ocr_launch_done", { started: out.started });
