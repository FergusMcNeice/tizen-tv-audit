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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 6000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// 1. dbus client tools?
out.tools = sh("for t in gdbus dbus-send dbus-test-tool busctl dconf; do echo -n \"$t: \"; which $t 2>/dev/null || echo missing; done");

// 2. find the CrsApi bus name + object path from the service binary strings
out.crs_strings = sh("grep -a -o -E '(samsung\\.tizen\\.[A-Za-z]+|/com/samsung/[A-Za-z/]+|/org/tizen/[A-Za-z/]+|CrsApi|GetChannel[A-Za-z]*|GetCurrentSourceInfo|GetChannelScrollStatus)' /usr/bin/contents-recognition-service | sort | uniq -c | sort -rn | head -25");

// 3. if gdbus exists: introspect the service
out.gdbus_names = sh("timeout 6 gdbus call --system --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames 2>&1 | tr ',' '\\n' | grep -iE 'crs|recogn|samsung|analysis' | head -15");

out.gdbus_intro = sh("timeout 6 gdbus introspect --system --dest samsung.tizen.CrsApi --object-path / 2>&1 | head -40");

// 4. alternative: python dbus? (python needs libpython fix) - find libpython
out.libpython = sh("find /usr /opt /lib -name 'libpython2.7*' 2>/dev/null | head -3; ls -la /usr/bin/python 2>&1");

// 5. OCR CPU (is the engine processing frames?)
out.cpu = sh("ps aux | grep -E 'contents-recognition|contents-analysis' | grep -v grep");

post("/ocr_dbus", out);
post("/ocr_dbus_done", { started: out.started });
