"use strict";
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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var OBJ = "/samsung/tizen/CrsApi";
var DEST = "samsung.tizen.CrsApi";

out.full_intro = sh("gdbus introspect --system --dest " + DEST + " --object-path " + OBJ, 12000);

// call every method visible (no-arg guesses); CrsApi methods take no args per earlier strings
var methods = ["GetChannelNumber", "GetChannelName", "GetChannelScrollStatus",
               "GetCallsign", "GetChannelTitle", "GetTitle", "GetCurrentSourceInfo",
               "GetChannelResult", "GetOTTInfo", "GetDeviceInfo", "GetState", "GetSource"];
out.calls = {};
for (var i = 0; i < methods.length; i++) {
    out.calls[methods[i]] = sh("gdbus call --system --dest " + DEST + " --object-path " + OBJ +
        " --method " + DEST + "." + methods[i] + " 2>&1 | head -3", 700);
}

// also Properties.GetAll on the CrsApi interface
out.props = sh("gdbus call --system --dest " + DEST + " --object-path " + OBJ +
    " --method org.freedesktop.DBus.Properties.GetAll " + DEST + " 2>&1 | head -5", 1200);

post("/ocr_crsapi2", out);
post("/ocr_crsapi2_done", { started: out.started });
