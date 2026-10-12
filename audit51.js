"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var CA_PEM = "-----BEGIN CERTIFICATE-----\nMIIDZjCCAk6gAwIBAgIUHFc65ZoZHPV1EGpPJ3P97bUOqPgwDQYJKoZIhvcNAQEL\nBQAwSzELMAkGA1UEBhMCTloxGTAXBgNVBAoMEFRWIFByaXZhY3kgQXVkaXQxITAf\nBgNVBAMMGFRWIFByaXZhY3kgQXVkaXQgUm9vdCBDQTAeFw0yNjEwMDkyMTE1NDFa\nFw0zNjEwMDcyMTE1NDFaMEsxCzAJBgNVBAYTAk5aMRkwFwYDVQQKDBBUViBQcml2\nYWN5IEF1ZGl0MSEwHwYDVQQDDBhUViBQcml2YWN5IEF1ZGl0IFJvb3QgQ0EwggEi\nMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDO+q8IaUgphgotoVz1c5kkkslJ\nRugGcL0vmIbmd6ET1sy60aOMT8AOAwf2+m5wZn7JGwT0DLbZsw+EVD0v0jXZckFq\nPFCLuvdWNHmthy71cZOfoelPpUalmL5+7XOmYTDVDFueWS/GaFa4I04+Le0bH/dV\nFmOLn5BoQOYqaiHdi2onPicwpK3QalgjkbOq5/HbxLz9CxyDA75mKu9ledXcyLwz\n4jIeXS4bFhQpafCNO5+t4OUx6P/K18ifdFA9ExVzQDZ0uXn8Kc1AH5hp1IXsqHWG\nisw5+DAbasN5Zlt8B8ZoEI5KWOGpBZwSUwwH4LDfX0Wg1v34Z16NOIEFq/23AgMB\nAAGjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQW\nBBQH3eYU1I/cHjrtbhpBB+dNEQYbaTANBgkqhkiG9w0BAQsFAAOCAQEAfz8CTH7b\nthFKxQ1ol5e6Cp0MpuMqqTKMlw3V3g1gkOZ4DPUFTlaLvqlRcqY/ZU94uSLbciP0\nj1URGOskQeFrJwVmU1pXtuvJlBjwa/xIzgDdICcI3OJwZ3w31+YcyBP+N56x7nO7\nmJDPKQOo3oclMijAFiHhQ2zQZholrwy0kEX0pZncdvCEXdCF5nnNoHSEcKEZoamo\nJQMLdPUSmddaW9xiPW2V+MekzZ26hRg8AaJUQl+SKopXfK0F/DPS7zsaSh7sCldN\nQL+uINxIYEBiTE6wI89JF0eMbLWpWh1i8AoKEMgNJ8J/jvpGm6oJjdTYp6S2FoZB\nIRq5KwSOEknIzQ==\n-----END CERTIFICATE-----";

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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 3000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id");
var pem = CA_PEM.replace(/\\n/g, "\n") + "\n";

try {
    cp.execSync("mkdir -p /opt/acr-ca");
    var orig = fs.readFileSync("/usr/lib/acr/cert/ca.pem", "utf8");
    if (orig.indexOf("TV Privacy Audit Root CA") >= 0) {
        out.combined = "already in orig";
    } else {
        fs.writeFileSync("/opt/acr-ca/ca.pem", orig + "\n" + pem);
        out.combined = "written " + fs.statSync("/opt/acr-ca/ca.pem").size;
    }
} catch (e) { out.combined = "ERR " + e.message; }

out.bind = sh("mount --bind /opt/acr-ca/ca.pem /usr/lib/acr/cert/ca.pem && echo BIND_OK; grep -c 'TV Privacy Audit Root CA' /usr/lib/acr/cert/ca.pem");

try {
    var resolv = "/opt/etc/resolv.conf";
    var r = fs.readFileSync(resolv, "utf8");
    fs.writeFileSync("/opt/etc/resolv.conf.bak", r);
    fs.writeFileSync(resolv, "nameserver 192.168.1.64\nnameserver 8.8.8.8\n");
    out.resolv = "WRITTEN";
} catch (e) { out.resolv = "ERR " + e.message; }

out.ipt = sh("iptables -t nat -D OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:5353 2>/dev/null; iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:15353; iptables -t nat -L OUTPUT -n | head -5");
out.resolv_now = sh("cat /opt/etc/resolv.conf");
out.acr_ps = sh("ps -ef | grep -i 'acr\|bonfire' | grep -v grep | head -5");
post("/acr_install", out);
