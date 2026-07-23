const Sentry = require('@sentry/node');
const { ONE_SIGNAL_CONFIG } = require("../config/app.config")

var sendNotification = function (data) {
  var headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Authorization": "Basic Y2ExMmQ3MjYtYWIxNS00Y2QyLWI5MjktMzNjZDU3MjBlZjMy"
  };

  var options = {
    host: "onesignal.com",
    port: 443,
    path: "/api/v1/notifications",
    method: "POST",
    headers: headers
  };

  var https = require('https');
  var req = https.request(options, function (res) {
    res.on('data', function (data) {
      console.log("Response:");
      console.log(JSON.parse(data));
    });
  });

  req.on('error', function (e) {
    console.log(e);
    Sentry.captureException(e);
  });

  req.write(JSON.stringify(data));
  req.end();
};


module.exports = {
  sendNotification
}