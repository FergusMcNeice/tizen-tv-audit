"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: timeout || 25000 });
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

function readf(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch (e) {
        return "ERR " + e.message;
    }
}

var out = {};
out.started = new Date().toISOString();

out.buxton_all = run(
    "for k in $(buxton2ctl list-keys system 2>/dev/null); do v=$(buxton2ctl get system $k 2>/dev/null); echo \"$k = $v\"; done",
    110000
);

out.voice_xml = {};
out.voice_xml.stt_config = readf("/home/owner/share/.voice/stt-config.xml");
out.voice_xml.tts_config = readf("/home/owner/share/.voice/tts-config.xml");
out.voice_xml.vc_config = readf("/home/owner/share/.voice/vc-config.xml");
out.voice_xml.vc_client_info = readf("/home/owner/share/.voice/vc/vc-client-info.xml");
out.voice_xml.vc_nlu_result = readf("/home/owner/share/.voice/vc/vc-nlu-result.xml");

var files = {};
files.vc_info_db = b64("/home/owner/share/.voice/vc/.vc_info.db");
files.vc_info_wal = b64("/home/owner/share/.voice/vc/.vc_info.db-wal");
files.vc_info_shm = b64("/home/owner/share/.voice/vc/.vc_info.db-shm");

post("/audit5_files", files);
post("/audit5", out);
