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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 3000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var PIN = "1\nTV Privacy Audit Root CA\nSHA1 Fingerprint=34:86:D3:3C:AA:7B:F8:6D:6D:39:2E:30:69:EC:B6:A5:07:C4:4C:CC\n-----BEGIN CERTIFICATE-----\nMIIDZjCCAk6gAwIBAgIUHFc65ZoZHPV1EGpPJ3P97bUOqPgwDQYJKoZIhvcNAQEL\nBQAwSzELMAkGA1UEBhMCTloxGTAXBgNVBAoMEFRWIFByaXZhY3kgQXVkaXQxITAf\nBgNVBAMMGFRWIFByaXZhY3kgQXVkaXQgUm9vdCBDQTAeFw0yNjEwMDkyMTE1NDFa\nFw0zNjEwMDcyMTE1NDFaMEsxCzAJBgNVBAYTAk5aMRkwFwYDVQQKDBBUViBQcml2\nYWN5IEF1ZGl0MSEwHwYDVQQDDBhUViBQcml2YWN5IEF1ZGl0IFJvb3QgQ0EwggEi\nMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDO+q8IaUgphgotoVz1c5kkkslJ\nRugGcL0vmIbmd6ET1sy60aOMT8AOAwf2+m5wZn7JGwT0DLbZsw+EVD0v0jXZckFq\nPFCLuvdWNHmthy71cZOfoelPpUalmL5+7XOmYTDVDFueWS/GaFa4I04+Le0bH/dV\nFmOLn5BoQOYqaiHdi2onPicwpK3QalgjkbOq5/HbxLz9CxyDA75mKu9ledXcyLwz\n4jIeXS4bFhQpafCNO5+t4OUx6P/K18ifdFA9ExVzQDZ0uXn8Kc1AH5hp1IXsqHWG\nisw5+DAbasN5Zlt8B8ZoEI5KWOGpBZwSUwwH4LDfX0Wg1v34Z16NOIEFq/23AgMB\nAAGjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQW\nBBQH3eYU1I/cHjrtbhpBB+dNEQYbaTANBgkqhkiG9w0BAQsFAAOCAQEAfz8CTH7b\nthFKxQ1ol5e6Cp0MpuMqqTKMlw3V3g1gkOZ4DPUFTlaLvqlRcqY/ZU94uSLbciP0\nj1URGOskQeFrJwVmU1pXtuvJlBjwa/xIzgDdICcI3OJwZ3w31+YcyBP+N56x7nO7\nmJDPKQOo3oclMijAFiHhQ2zQZholrwy0kEX0pZncdvCEXdCF5nnNoHSEcKEZoamo\nJQMLdPUSmddaW9xiPW2V+MekzZ26hRg8AaJUQl+SKopXfK0F/DPS7zsaSh7sCldN\nQL+uINxIYEBiTE6wI89JF0eMbLWpWh1i8AoKEMgNJ8J/jvpGm6oJjdTYp6S2FoZB\nIRq5KwSOEknIzQ==\n-----END CERTIFICATE-----\n";
var out = {};
out.started = new Date().toISOString();
try {
    fs.writeFileSync("/opt/acr-ca/ca.pem", PIN.replace(/\\n/g, "\n"));
    out.wrote = "ok " + fs.statSync("/opt/acr-ca/ca.pem").size;
} catch (e) { out.wrote = "ERR " + e.message; }
out.view = sh("head -4 /usr/lib/acr/cert/ca.pem; md5sum /opt/acr-ca/ca.pem /usr/lib/acr/cert/ca.pem");
out.devkey = sh("grep -c 'PRIVATE KEY' /usr/lib/acr/cert/SamsungDeviceCertificate.pem; head -2 /usr/lib/acr/cert/SamsungDeviceCertificate.pem");
out.kill = sh("kill 1902 2>&1; kill 1910 2>&1; echo KILLED");
post("/acr_pinfix", out);
setTimeout(function () {
    var o = {};
    o.acr_ps = sh("ps -ef | grep -i acr | grep -v grep | head -4");
    post("/acr_after_restart", o);
}, 8000);
