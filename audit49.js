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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function stringsOf(buf, minLen) {
    var out = [];
    var cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) { cur += String.fromCharCode(c); }
        else { if (cur.length >= (minLen || 6)) out.push(cur); cur = ""; }
    }
    if (cur.length >= (minLen || 6)) out.push(cur);
    return out;
}

var inv = {};
inv.started = new Date().toISOString();
inv.id = sh("id");
inv.ps = sh("ps -A 2>/dev/null | head -120");
inv.proc_cmdline = sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *[Aa][Cc][Rr]*|*emp*|*[Aa][Dd][Aa]gent*|*seal*|*billing*) echo \"$p $c\";; esac; done | head -40");
inv.netstat = sh("netstat -tnp 2>/dev/null | head -50; echo === UDP/TCP 443; netstat -an 2>/dev/null | grep -E ':443|:5223|:8443|:80 ' | head -40");
inv.acr_app_ls = sh("ls -laR /opt/usr/apps/org.tizen.acr-service-app 2>&1 | head -120");
inv.acr_app_find = sh("find /opt/usr/apps/org.tizen.acr-service-app -type f 2>/dev/null | head -60");
inv.acr_sys_find = sh("find /usr/apps /usr/lib /usr/bin /usr/sbin /opt/usr/apps/NSF -iname '*acr*' 2>/dev/null | head -60; echo === emp; find /usr/lib /usr/bin /usr/sbin /opt/usr -iname '*emp*' -maxdepth 4 2>/dev/null | head -60");
inv.rules = sh("cat /opt/var/security-manager/rules/app_org.tizen.acr-service-app 2>/dev/null | head -40; echo ===; cat /opt/var/security-manager/rules/pkg_org.tizen.acr-service-app 2>/dev/null | head -20");
inv.dlogutil = sh("dlogutil -h 2>&1 | head -25");
inv.dlog_acr = sh("dlogutil -t 2>/dev/null | grep -iE 'acr|empAD|empACR|samsungacr|alphonso|gracenote|fingerprint' | head -50");
inv.filecaps = sh("getcap -r /usr/bin /usr/sbin /usr/lib 2>/dev/null | head -30; echo ===; ls -la /usr/apps 2>/dev/null | head -40");

post("/acrinv", inv);

var files = [];
var seen = {};
function pull(p, note) {
    if (seen[p]) return;
    seen[p] = 1;
    try {
        var st = fs.statSync(p);
        if (!st.isFile() || st.size > 6000000) { files.push({ path: p, err: "skip size " + st.size }); return; }
        var buf = fs.readFileSync(p);
        files.push({ path: p, size: st.size, note: note || "", b64: buf.toString("base64") });
    } catch (e) { files.push({ path: p, err: String(e.message || e) }); }
}

var textRe = /\.(xml|json|conf|cfg|ini|txt|js|html|plist|policy|rules|sql|db)$/i;
var acrPaths = (inv.acr_app_find + "\n" + inv.acr_sys_find).split("\n");
for (var i = 0; i < acrPaths.length; i++) {
    var p = acrPaths[i].trim();
    if (p.indexOf("/") !== 0) continue;
    if (p.indexOf("Permission") !== -1) continue;
    if (/\.png$|\.jpg$|\.so$/.test(p) && p.indexOf("NSF") === -1) continue;
    pull(p, "acrpath");
}

var extra = [
    "/opt/var/security-manager/rules/app_org.tizen.acr-service-app",
    "/opt/var/security-manager/rules/pkg_org.tizen.acr-service-app",
    "/opt/var/lib/buxton2/system.db",
    "/opt/var/lib/buxton2/system.db-journal"
];
for (var e = 0; e < extra.length; e++) pull(extra[e], "extra");

var interesting = [];
var interestingRe = /(https?:\/\/|samsungacr|samsungcloud|ingest|collect|fingerprint|watermark|audio|gracenote|alphonso|samba|nielsen|tvvision|duid|privateduid|psid|atoken|acr_|ACR|empACR|empAD|adid|idfa|tvid|upload|beacon|log-ingestion|partner|viewinginfo|contentid|channel)/i;
for (var f = 0; f < files.length; f++) {
    var fl = files[f];
    if (!fl.b64) continue;
    if (fl.size > 3000000) continue;
    try {
        var buf = new Buffer(fl.b64, "base64");
        var strs = stringsOf(buf, 6);
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 400; s++) {
            if (interestingRe.test(strs[s])) keep.push(strs[s].slice(0, 200));
        }
        if (keep.length) interesting.push({ path: fl.path, strings: keep });
    } catch (err) {}
}

var chunks = [];
var cur = [];
var curLen = 0;
for (var f2 = 0; f2 < files.length; f2++) {
    var fl2 = files[f2];
    var sz2 = fl2.b64 ? fl2.b64.length : 100;
    if (curLen + sz2 > 700000 && cur.length) { chunks.push(cur); cur = []; curLen = 0; }
    cur.push(fl2);
    curLen += sz2;
}
if (cur.length) chunks.push(cur);

var total = 0;
for (var t = 0; t < files.length; t++) total += files[t].size || 0;

var idx = 0;
function next() {
    if (idx >= chunks.length) {
        post("/acrstrings", { started: inv.started, files: files.length, bytes: total, interesting: interesting });
        post("/acr_done", { started: inv.started, files: files.length, chunks: chunks.length, interesting: interesting.length });
        return;
    }
    var n = idx;
    idx++;
    post("/acrpull_" + n, { started: inv.started, chunk: n, of: chunks.length, files: chunks[n] }, function () { next(); });
}
next();
