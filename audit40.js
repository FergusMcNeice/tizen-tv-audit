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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 14000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function dumpdb(path, cap) {
    return sh("echo DB:" + path + "; for t in $(sqlite3 " + path + " .tables 2>/dev/null); do echo TABLE:$t COUNT:$(sqlite3 " + path + " \"SELECT COUNT(*) FROM $t;\" 2>/dev/null); sqlite3 -header " + path + " \"SELECT * FROM $t LIMIT 3;\" 2>/dev/null | head -c 1200; echo; done", cap);
}

var out = {};
out.started = new Date().toISOString();
out.avoc = dumpdb("/opt/dbspace/.avoc.db", 14000);
post("/sql_avoc", out);

var out2 = {};
out2.freesia0 = dumpdb("/opt/usr/apps/slive-provider/data/freesia_ontv_0.db", 12000);
out2.profile = dumpdb("/opt/usr/apps/slive-provider/data/profile.db", 8000);
post("/sql_freesia", out2);

var out3 = {};
out3.channel = dumpdb("/opt/usr/apps/context-aware-service/data/channel.db", 12000);
out3.hdcontrol = dumpdb("/opt/usr/apps/org.tizen.homedatacontrol-service/data/data.db", 12000);
out3.bookmarks = dumpdb("/opt/usr/data/browser-provider/database/.browser-provider-bookmarks.db", 10000);
out3.tabs = dumpdb("/opt/usr/data/browser-provider/database/.browser-provider-tabs.db", 8000);
post("/sql_misc", out3);
