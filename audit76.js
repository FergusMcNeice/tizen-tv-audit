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
out.id = sh("id | head -c 120");

// identify the dmr process + binary
out.dmr_proc = sh("ls -la /proc/2150/exe 2>/dev/null; cat /proc/2150/cmdline 2>/dev/null | tr '\\0' ' '; echo");
out.dmr_cwd = sh("ls -la /proc/2150/cwd 2>/dev/null; cat /proc/2150/environ 2>/dev/null | tr '\\0' '\\n' | head -25");

// strings from the dmr binary: state machine / fault strings / Play gating
out.dmr_strings_state = sh("strings /usr/bin/dmr 2>/dev/null | grep -iE 'transition|not available|PlayMedia|SetAVTransport|NoMedia|STOPPED|PLAYING|source|foreground|app.*run|busy' | head -50", 5000);
out.dmr_strings_all = sh("strings /usr/bin/dmr 2>/dev/null | grep -iE 'AVTransport|InstanceID|CurrentURI|protocolInfo|dlna|contentFeatures' | head -40", 4000);

// where does dmr live + its config
out.dmr_files = sh("ls -la /usr/bin/dmr /usr/apps/*dmr* /opt/usr/apps/*dmr* 2>/dev/null; find /usr/apps /opt/usr/apps /etc /opt/etc -iname '*dmr*' -o -iname '*renderer*' 2>/dev/null | head -15");

// dmr log tags (bounded)
out.dlog_dmr = sh("dlogutil -t DMR 2>/dev/null | tail -20", 3000);
out.dlog_tags = sh("dlogutil -s 2>/dev/null | grep -iE '\\[dmr\\]|AVTransport|SetAVTransport|Transition not' | tail -25", 3500);

// what the TV thinks its current source / foreground is
out.foreground = sh("cat /proc/2743/cmdline 2>/dev/null | tr '\\0' ' ' | head -c 300; echo; ls /run/aul/apps/5001/ 2>/dev/null | tr '\\n' ' '");
out.source_hint = sh("grep -riE 'source|input' /opt/var/dbspace 2>/dev/null | head -3; cat /opt/etc/settings-service/*.conf 2>/dev/null | head -10");

// media player entry points (mm-player, muse) + TZ demuxer threads
out.player = sh("ls -la /usr/bin/mm-player /usr/bin/muse* /usr/lib/libmmfw* 2>/dev/null | head -12");
out.demux_threads = sh("ps aux | grep -E 'DEMUX|muse-server|media-server|dmr' | grep -v grep");

post("/avt2", out);
post("/avt2_done", { started: out.started });
