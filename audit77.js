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

var out = {};
out.started = new Date().toISOString();

// 1. the player interface XMLs (define the vddmr playback IPC)
var xmls = [
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.vddmr.interface.xml",
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.player-video-vddmr.interface.xml",
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.player-audio-vddmr.interface.xml",
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.player-image-vddmr.interface.xml",
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.player-image-tp-vddmr.interface.xml",
    "/usr/apps/dmr_service_app/bin/com.samsung.tizen.player-rvu-vddmr.interface.xml"
];
out.xmls = [];
for (var i = 0; i < xmls.length; i++) {
    try {
        var buf = fs.readFileSync(xmls[i]);
        out.xmls.push({ path: xmls[i], size: buf.length, text: buf.toString("utf8").slice(0, 6000) });
    } catch (e) { out.xmls.push({ path: xmls[i], err: String(e.message || e) }); }
}

// 2. strings from the real dmr binary: state machine + error strings
out.dmr_state = sh("strings /usr/apps/dmr_service_app/bin/dmr | grep -iE 'transition|not available|PlayMedia|SetAVTransport|NoMedia|STOPPED|PLAYING|PAUSED|source|foreground|busy|error|701|InstanceID' | head -60", 6000);
out.dmr_ipc = sh("strings /usr/apps/dmr_service_app/bin/dmr | grep -iE 'vddmr|player-|interface|dbus|method|Play|Pause|Stop|SetURI|Open' | head -50", 5000);
out.dmr_size = sh("ls -la /usr/apps/dmr_service_app/bin/dmr /usr/apps/dmr_service_app/dmr_web_root 2>/dev/null; ls /usr/apps/dmr_service_app/dmr_web_root 2>/dev/null | head -20");

// 3. mycontents DMR client source (JS, readable) — shows the intended call sequence
out.dmr_js = sh("cat /usr/apps/org.volt.mycontents/src_original/app/musicplayer/app/controller/dmr-controller.js 2>/dev/null | head -120", 6000);
out.dmr_js2 = sh("cat /usr/apps/org.volt.mycontents/src_original/app/musicplayer/app/models/data-provider-dmr.js 2>/dev/null | head -80", 4000);

post("/avt3", out);
post("/avt3_done", { started: out.started });
