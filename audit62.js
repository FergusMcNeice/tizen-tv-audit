"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;
var CA_PEM = "-----BEGIN CERTIFICATE-----\\nMIIDZjCCAk6gAwIBAgIUHFc65ZoZHPV1EGpPJ3P97bUOqPgwDQYJKoZIhvcNAQEL\\nBQAwSzELMAkGA1UEBhMCTloxGTAXBgNVBAoMEFRWIFByaXZhY3kgQXVkaXQxITAf\\nBgNVBAMMGFRWIFByaXZhY3kgQXVkaXQgUm9vdCBDQTAeFw0yNjEwMDkyMTE1NDFa\\nFw0zNjEwMDcyMTE1NDFaMEsxCzAJBgNVBAYTAk5aMRkwFwYDVQQKDBBUViBQcml2\\nYWN5IEF1ZGl0MSEwHwYDVQQDDBhUViBQcml2YWN5IEF1ZGl0IFJvb3QgQ0EwggEi\\nMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDO+q8IaUgphgotoVz1c5kkkslJ\\nRugGcL0vmIbmd6ET1sy60aOMT8AOAwf2+m5wZn7JGwT0DLbZsw+EVD0v0jXZckFq\\nPFCLuvdWNHmthy71cZOfoelPpUalmL5+7XOmYTDVDFueWS/GaFa4I04+Le0bH/dV\\nFmOLn5BoQOYqaiHdi2onPicwpK3QalgjkbOq5/HbxLz9CxyDA75mKu9ledXcyLwz\\n4jIeXS4bFhQpafCNO5+t4OUx6P/K18ifdFA9ExVzQDZ0uXn8Kc1AH5hp1IXsqHWG\\nisw5+DAbasN5Zlt8B8ZoEI5KWOGpBZwSUwwH4LDfX0Wg1v34Z16NOIEFq/23AgMB\\nAAGjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQW\\nBBQH3eYU1I/cHjrtbhpBB+dNEQYbaTANBgkqhkiG9w0BAQsFAAOCAQEAfz8CTH7b\\nthFKxQ1ol5e6Cp0MpuMqqTKMlw3V3g1gkOZ4DPUFTlaLvqlRcqY/ZU94uSLbciP0\\nj1URGOskQeFrJwVmU1pXtuvJlBjwa/xIzgDdICcI3OJwZ3w31+YcyBP+N56x7nO7\\nmJDPKQOo3oclMijAFiHhQ2zQZholrwy0kEX0pZncdvCEXdCF5nnNoHSEcKEZoamo\\nJQMLdPUSmddaW9xiPW2V+MekzZ26hRg8AaJUQl+SKopXfK0F/DPS7zsaSh7sCldN\\nQL+uINxIYEBiTE6wI89JF0eMbLWpWh1i8AoKEMgNJ8J/jvpGm6oJjdTYp6S2FoZB\\nIRq5KwSOEknIzQ==\\n-----END CERTIFICATE-----";

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 60000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var pem = CA_PEM.replace(/\\n/g, "\n") + "\n";
fs.writeFileSync("/tmp/tv-audit-ca.pem", pem);

out.probe = sh("ls -la /opt/etc/ssl/ /opt/etc/ssl/certs 2>&1 | head -12; ls -la /usr/lib/ssl/ 2>&1 | head -8; ls -la /etc/ssl/ 2>&1 | head -8; ls /opt/var/lib/ca-certificates/ 2>&1 | head -5");

var targets = [
    "/opt/etc/ssl/cert.pem",
    "/opt/etc/ssl/certs/ca-certificates.crt",
    "/usr/lib/ssl/cert.pem",
    "/usr/lib/ssl/certs/ca-certificates.crt",
    "/etc/ssl/cert.pem",
    "/etc/ssl/certs/ca-certificates.crt",
    "/opt/var/lib/ca-certificates/ca-bundle.pem"
];
out.mounts = "";
for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    var r = sh("test -f " + t + " && echo EXISTS || echo MISSING");
    if (r.indexOf("EXISTS") === -1) { out.mounts += t + " MISSING; "; continue; }
    var merged = "/tmp/merged_" + i + ".pem";
    sh("cp " + t + " " + merged + " 2>/dev/null");
    fs.writeFileSync("/tmp/ca_one.pem", pem);
    sh("cat /tmp/ca_one.pem >> " + merged);
    var m = sh("mount --bind " + merged + " " + t + " && echo MOUNTED_" + i);
    out.mounts += t + " " + m.trim().replace(/\n/g, " ") + "; ";
}

out.hashdir = sh("rm -rf /tmp/certs_copy; cp -a /opt/etc/ssl/certs /tmp/certs_copy 2>/dev/null; ls /tmp/certs_copy 2>/dev/null | wc -l");
fs.writeFileSync("/tmp/ca_one.pem", pem);
out.hashfile = sh("cp /tmp/ca_one.pem /tmp/certs_copy/9893a9bf.0 && mount --bind /tmp/certs_copy /opt/etc/ssl/certs && echo CERTDIR_MOUNTED && ls /opt/etc/ssl/certs | wc -l");
post("/acr62", out);
post("/acr62_done", { started: out.started });
