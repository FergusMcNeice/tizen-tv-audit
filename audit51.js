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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 45000 }).slice(0, cap || 2000000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();

var pem = CA_PEM.replace(/\\n/g, "\n") + "\n";
fs.writeFileSync("/tmp/tv-audit-ca.pem", pem);

out.ca_write = sh("cp /usr/lib/acr/cert/ca.pem /usr/lib/acr/cert/ca.pem.bak && cat /tmp/tv-audit-ca.pem >> /usr/lib/acr/cert/ca.pem && echo APPENDED_TO_ACR_CA && wc -c /usr/lib/acr/cert/ca.pem");
out.devcert = sh("cat /usr/lib/acr/cert/SamsungDeviceCertificate.pem");
out.nnmap = sh("cat /usr/lib/acr/acr_ccd/cnn/ui.nn.mapping");
out.acr_ca_head = sh("head -c 400 /usr/lib/acr/cert/ca.pem");
out.dlog2 = sh("dlogutil -d -b main -t 300 2>&1 | grep -iE 'acr|ACRService|psid|adagent' | head -40");

post("/acr51a", out);

var bins = {};
bins.started = out.started;
bins.service_app_b64 = sh("base64 /usr/apps/org.tizen.acr-service-app/bin/acr-service-app", 300000);
bins.bonfire_head = sh("head -c 2000 /usr/lib/acr/libbonfire.so | base64");
post("/acr51b", bins);

post("/acr51_done", { started: out.started });
