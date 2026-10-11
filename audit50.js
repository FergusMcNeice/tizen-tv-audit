"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;
var CA_PEM = "-----BEGIN CERTIFICATE-----\\nMIIDZjCCAk6gAwIBAgIUHFc65ZoZHPV1EGpPJ3P97bUOqPgwDQYJKoZIhvcNAQEL\\nBQAwSzELMAkGA1UEBhMCTloxGTAXBgNVBAoMEFRWIFByaXZhY3kgQXVkaXQxITAf\\nBgNVBAMMGFRWIFByaXZhY3kgQXVkaXQgUm9vdCBDQTAeFw0yNjEwMDkyMTE1NDFa\\nFw0zNjEwMDcyMTE1NDFaMEsxCzAJBgNVBAYTAk5aMRkwFwYDVQQKDBBUViBQcml2\\nYWN5IEF1ZGl0MSEwHwYDVQQDDBhUViBQcml2YWN5IEF1ZGl0IFJvb3QgQ0EwggEi\\nMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDO+q8IaUgphgotoVz1c5kkkslJ\\nRugGcL0vmIbmd6ET1sy60aOMT8AOAwf2+m5wZn7JGwT0DLbZsw+EVD0v0jXZckFq\\nPFCLuvdWNHmthy71cZOfoelPpUalmL5+7XOmYTDVDFueWS/GaFa4I04+Le0bH/dV\\nFmOLn5BoQOYqaiHdi2onPicwpK3QalgjkbOq5/HbxLz9CxyDA75mKu9ledXcyLwz\\n4jIeXS4bFhQpafCNO5+t4OUx6P/K18ifdFA9ExVzQDZ0uXn8Kc1AH5hp1IXsqHWG\\nisw5+DAbasN5Zlt8B8ZoEI5KWOGpBZwSUwwH4LDfX0Wg1v34Z16NOIEFq/23AgMB\\nAAGjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQW\\nBBQH3eYU1I/cHjrtbhpBB+dNEQYbaTANBgkqhkiG9w0BAQsFAAOCAQEAfz8CTH7b\\nthFKxQ1ol5e6Cp0MpuMqqTKMlw3V3g1gkOZ4DPUFTlaLvqlRcqY/ZU94uSLbciP0\\nj1URGOskQeFrJwVmU1pXtuvJlBjwa/xIzgDdICcI3OJwZ3w31+YcyBP+N56x7nO7\\nmJDPKQOo3oclMijAFiHhQ2zQZholrwy0kEX0pZncdvCEXdCF5nnNoHSEcKEZoamo\\nJQMLdPUSmddaW9xiPW2V+MekzZ26hRg8AaJUQl+SKopXfK0F/DPS7zsaSh7sCldN\\nQL+uINxIYEBiTE6wI89JF0eMbLWpWh1i8AoKEMgNJ8J/jvpGm6oJjdTYp6S2FoZB\\nIRq5KwSOEknIzQ==\\n-----END CERTIFICATE-----";
var CA_NAME = "TV Privacy Audit Root CA";

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

var pem = CA_PEM.replace(/\\n/g, "\n") + "\n";

var BUNDLE = "/opt/var/lib/ca-certificates/ca-bundle.pem";
var bundle = "";
try { bundle = fs.readFileSync(BUNDLE, "utf8"); out.bundle_before = bundle.length; } catch (e) { out.bundle_before = "ERR " + e.message; }
if (bundle.indexOf(CA_NAME) === -1 && bundle.length > 100) {
    try {
        fs.writeFileSync(BUNDLE + ".bak", bundle);
        fs.writeFileSync(BUNDLE, bundle + "\n" + pem);
        out.append = "APPENDED via fs";
    } catch (e) {
        out.append = "fs write failed: " + e.message + " -> try shell";
        fs.writeFileSync("/tmp/tv-audit-ca.pem", pem);
        out.append += " shell: " + sh("cat /tmp/tv-audit-ca.pem >> " + BUNDLE + " && echo OK");
    }
} else {
    out.append = bundle.length <= 100 ? "bundle unreadable" : "already present";
}

var hashTargets = ["/opt/etc/ssl/certs/9893a9bf.0", "/etc/ssl/certs/9893a9bf.0", "/usr/share/ca-certificates/certs/9893a9bf.0"];
out.hash_files = "";
for (var h = 0; h < hashTargets.length; h++) {
    try {
        if (fs.existsSync(hashTargets[h].replace(/9893a9bf\.0$/, ""))) {
            fs.writeFileSync(hashTargets[h], pem);
            out.hash_files += hashTargets[h] + " WRITTEN; ";
        }
    } catch (e) { out.hash_files += hashTargets[h] + " ERR " + e.message + "; "; }
}

out.acr_dir = sh("ls -laR /usr/lib/acr 2>&1 | head -80");
out.acr_ccd_count = sh("find /usr/lib/acr -type f 2>/dev/null | wc -l; du -sh /usr/lib/acr 2>/dev/null");
out.tmp_acr = sh("ls -laR /tmp/acr 2>&1 | head -40; echo ===; find /tmp/acr -type f -size -100k 2>/dev/null | head -20 | while read f; do echo FILE:$f; head -c 800 $f; echo; done");
out.acr_ps = sh("ps -A 2>/dev/null | grep -iE 'acr|adagent|seal|billing' ");
out.acr_proc = sh("for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *acr*|*adagent*) echo PID:$p CMD:$c; ls -la $p/fd 2>/dev/null | head -25; echo ---;; esac; done | head -120");
out.acr_net = sh("netstat -tnp 2>/dev/null | grep -iE 'acr|adagent' ; echo ===; netstat -an 2>/dev/null | grep -E ':443|:5223' | head -20");
out.dlog = sh("dlogutil -d -t 400 2>&1 | grep -iE 'acr|psid|adagent|samsungacr|sorenson|gracenote' | head -60");
out.service_app = sh("ls -la /usr/apps/org.tizen.acr-service-app/bin/ 2>&1; echo ===; base64 /proc/$(pidof acr-service-app 2>/dev/null | awk '{print $1}')/exe 2>/dev/null | head -c 100; echo; pidof acr acr-service-app adagentd 2>/dev/null");
out.ccd_files = sh("find /usr/lib/acr /usr/share /usr/apps/org.tizen.acr-service-app -type f \\( -iname '*ccd*' -o -iname '*template*' -o -iname '*.cnn' -o -iname '*.model' \\) 2>/dev/null | head -30");

post("/acr50", out);
post("/acr50_done", { started: out.started });
