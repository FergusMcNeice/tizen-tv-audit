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
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 6)) out.push(cur); cur = ""; }
    }
    return out;
}

var D = "/opt/data/contents-recognition-service/data/";
var U = "/usr/apps/org.tizen.contents-recognition-service/data/";

var out = {};
out.started = new Date().toISOString();
out.support_language = sh("cat " + D + "support_language.txt");
out.channel_scroll = sh("cat " + D + "channel_scroll.txt");
out.errdic = sh("cat " + D + "error_correct_dic.txt");
out.ott_id = sh("cat " + D + "template/ott_id.mapping");
out.stb_id = sh("cat " + D + "template/stb_id.mapping");
out.localset_id = sh("cat " + D + "template/localset_id.mapping");
out.template_ls = sh("ls -la " + D + "template/ | head -60; echo COUNT; ls " + D + "template/ | wc -l");
out.otttitle_head = sh("head -30 " + D + "ottTitle_ccid.txt; echo ===TAIL; tail -10 " + D + "ottTitle_ccid.txt; echo ===LINES; wc -l " + D + "ottTitle_ccid.txt");
out.otttitle_fields = sh("awk -F'|' 'NF>1{print NF}' " + D + "ottTitle_ccid.txt 2>/dev/null | sort | uniq -c | head; echo ===SAMPLE2; sed -n '100,115p' " + D + "ottTitle_ccid.txt");
post("/ocr6", out);

function scanBin(path, tag) {
    try {
        var buf = fs.readFileSync(path);
        var rx = /(genre|GENRE|categor|Categor|CR_SOURCE|CR_STATE|CR_EXTERN|ENUM|NUMBER_TYPE|TITLE_POS|DeviceKind|DEVICE_KIND|source_type|SourceType|movie|drama|sports|news|music|kids|education|entertainment|documentary|action|comedy|horror|romance|sci|animation|game|show|series|live)/i;
        var strs = stringsOf(buf, 4);
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 250; s++) {
            if (rx.test(strs[s]) && !/^_Z/.test(strs[s])) keep.push(strs[s].slice(0, 120));
        }
        return { tag: tag, size: buf.length, hits: keep };
    } catch (e) { return { tag: tag, err: String(e.message || e) }; }
}

var scans = [];
scans.push(scanBin("/usr/bin/contents-analysis-service", "contents-analysis-service"));
scans.push(scanBin("/usr/bin/contents-recognition-service", "contents-recognition-service"));
scans.push(scanBin("/opt/data/contents-recognition-service/data/libOCREngine.so", "libOCREngine"));
post("/ocr7", { started: out.started, scans: scans });

post("/ocr_done3", { started: out.started });
