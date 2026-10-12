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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 12000 }).slice(0, cap || 6000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

// 1. find the bus name
out.busctl = sh("busctl --system list 2>&1 | grep -iE 'crs|recogn|samsung|analysis' | head -10");

// 2. introspect root for child nodes
out.intro_root = sh("gdbus introspect --system --dest samsung.tizen.CrsApi --object-path / 2>&1 | head -30");

// 3. common object paths
var paths = ["/com/samsung/tizen/CrsApi", "/CrsApi", "/org/tizen/CrsApi",
             "/com/samsung/tizen/crs", "/samsung/tizen/CrsApi", "/com/samsung/CrsApi"];
out.paths = {};
for (var i = 0; i < paths.length; i++) {
    out.paths[paths[i]] = sh("gdbus introspect --system --dest samsung.tizen.CrsApi --object-path " + paths[i] + " 2>&1 | head -12", 1500);
}

// 4. try method calls on the most likely paths
out.calls = {};
for (var j = 0; j < paths.length; j++) {
    out.calls[paths[j] + " GetName"] = sh("gdbus call --system --dest samsung.tizen.CrsApi --object-path " + paths[j] + " --method samsung.tizen.CrsApi.GetChannelName 2>&1 | head -3", 800);
    out.calls[paths[j] + " GetNum"] = sh("gdbus call --system --dest samsung.tizen.CrsApi --object-path " + paths[j] + " --method samsung.tizen.CrsApi.GetChannelNumber 2>&1 | head -3", 800);
}

post("/ocr_crsapi", out);
post("/ocr_crsapi_done", { started: out.started });
