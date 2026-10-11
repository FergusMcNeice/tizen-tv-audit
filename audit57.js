"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body, cb) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); if (cb) cb(null); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); if (cb) cb(e); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function scanProcMem(pid, tag) {
    var out = { tag: tag, pid: pid, regions: 0, bytes: 0, hits: [] };
    var maps;
    try { maps = fs.readFileSync("/proc/" + pid + "/maps", "utf8"); } catch (e) { out.err = "maps " + e.message; return out; }
    var fd;
    try { fd = fs.openSync("/proc/" + pid + "/mem", "r"); } catch (e) { out.err = "mem " + e.message; return out; }
    var rx = /(device_id|psid|query_info|query_sum|fp_ver|recog_content|uduration|tz_history|hdmi_info|sorconfigstring|contentId|matchInfo|ACR_MATCH|firmware_version|model_id|tv_source|tv_ch)/;
    var lines = maps.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^([0-9a-f]+)-([0-9a-f]+) (r[w-])/);
        if (!m) continue;
        if (m[3].indexOf("w") === -1) continue;
        var start = parseInt(m[1], 16);
        var end = parseInt(m[2], 16);
        var size = end - start;
        if (size > 64 * 1024 * 1024) continue;
        out.regions++;
        var buf = new Buffer(size);
        var got = 0;
        try { got = fs.readSync(fd, buf, 0, size, start); } catch (e) { continue; }
        out.bytes += got;
        var s = buf.toString("latin1", 0, got);
        var idx = 0;
        while (out.hits.length < 60) {
            var p = s.indexOf("{", idx);
            if (p === -1) break;
            idx = p + 1;
            if (!rx.test(s.substr(p, 600))) continue;
            out.hits.push(s.substr(p, 500).replace(/[^\x20-\x7e]/g, "."));
        }
        if (out.hits.length >= 60) break;
    }
    try { fs.closeSync(fd); } catch (e) {}
    return out;
}

var out = {};
out.started = new Date().toISOString();
out.pids = sh("pidof acr acr-service-app adagentd contents-recognition-service contents-analysis-service");
post("/acr57a", out);

var pidlist = (out.pids || "").trim().split(/\s+/);
var scans = [];
var names = {};
names[out.pids] = "";
var cmd = sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null | head -c 80); case \"$c\" in *acr*|*adagent*|*recognition*|*analysis*) echo \"$p $c\";; esac; done");
var clines = cmd.split("\n");
for (var i = 0; i < clines.length; i++) {
    var mm = clines[i].match(/\/proc\/(\d+)\s+(.*)/);
    if (!mm) continue;
    scans.push(scanProcMem(mm[1], mm[2].slice(0, 60)));
}
post("/acr57b", { started: out.started, scans: scans });
post("/acr57_done", { started: out.started });
