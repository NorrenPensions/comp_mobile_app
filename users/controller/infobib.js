const Sentry = require('@sentry/node');
var https = require('follow-redirects').https;
var fs = require('fs');

var options = {
    'method': 'POST',
    'hostname': 'rdndp.api.infobip.com',
    'path': '/2fa/2/pin?ncNeeded=true',
    'headers': {
        'Authorization': '{authorization}',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    'maxRedirects': 20
};

var req = https.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function (chunk) {
        var body = Buffer.concat(chunks);
        console.log(body.toString());
    });

    res.on("error", function (error) {
        console.error(error);
    });
});

var postData = JSON.stringify({
    "applicationId": "1234567",
    "messageId": "7654321",
    "from": "Sender 1",
    "to": "41793026727",

    "placeholders": { "firstName": "John" }
});

req.write(postData);

req.end();

/////////////////////////////////////////////////////////////////////////////////
var https = require('follow-redirects').https;
var fs = require('fs');

var options = {
    'method': 'POST',
    'hostname': 'rdndp.api.infobip.com',
    'path': '/2fa/2/applications/0933F3BC087D2A617AC6DCB2EF5B8A61/messages',
    'headers': {
        'Authorization': '{authorization}',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    'maxRedirects': 20
};

var req = https.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function (chunk) {
        var body = Buffer.concat(chunks);
        console.log(body.toString());
    });

    res.on("error", function (error) {
        console.error(error);
    });
});

var postData = JSON.stringify({
    "pinType": "NUMERIC",
    "messageText": "Your pin is {{pin}}",
    "pinLength": 4,
    "language": "en",
    "senderId": "Infobip 2FA",
    "repeatDTMF": "1#", "speechRate": 1
});

req.write(postData);

req.end();