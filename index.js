require("./instrument.js");
const Sentry = require("@sentry/node");
const express = require("express");
const userRouts = require("./users/router/user.routes");
const contributionsRouts = require("./users/router/contributions.routes");
const newsRoute = require("./users/router/news.routes");
const branchRoute = require("./users/router/branches.routes");
const faqsRoute = require("./users/router/faq.routes");
const contact = require("./users/router/contact.routes");
const downloads = require("./users/router/download.routes");
const recapture = require("./users/router/recapture.routes");
const otp = require("./users/router/otp.routes");
const notifications = require("./users/router/notification.routes");
const mailer = require("./users/router/mailer.routes");
const pages = require("./users/router/pages.routes");
const units = require("./users/router/units.routes");
const featured = require("./users/router/featured.routes");
const pushNotification = require("./users/router/push-notification.routes");
const AgentRsa = require("./agents/routes/agents.routes");
const admin = require("./agents/routes/admin.routes");
const docs = require("./agents/routes/docs.routes");
const users = require("./agents/routes/users.routes");

const Cors = require("cors");

// HTTPS options
// const httpsOptions = {
//   key: fs.readFileSync(path.resolve(__dirname, '../server.key')),
//   cert: fs.readFileSync(path.resolve(__dirname, '../certificate.pem'))
// };

let app = express();
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(Cors());
app.use(userRouts);
app.use(otp);
app.use(contributionsRouts);
app.use(newsRoute);
app.use(branchRoute);
app.use(faqsRoute);
app.use(contact);
app.use(downloads);
app.use(recapture);
app.use(notifications);
app.use(mailer);
app.use(pages);
app.use(units);
app.use(featured);
app.use(pushNotification);
app.use(AgentRsa);
app.use(users);
app.use(docs);
app.use(admin);


app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Register Sentry error handler after all routes
Sentry.setupExpressErrorHandler(app);

// Optional error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(res.sentry || "Internal Server Error");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`App listening on port ${PORT}`);
});


// app.get("/debug-sentry", function mainHandler(req, res) {
//   throw new Error("My first Sentry error!");
// });

// app.get('/health', (_req, res) => {
//   res.status(200).json({
//     status: 'ok',
//     timestamp: new Date().toISOString(),
//   });
// });

// // The error handler must be registered before any other error middleware and after all controllers
// Sentry.setupExpressErrorHandler(app);

// // Optional fallthrough error handler
// app.use(function onError(err, req, res, next) {
//   // The error id is attached to `res.sentry` to be returned
//   // and optionally displayed to the user for support.
//   res.statusCode = 500;
//   res.end(res.sentry + "\n");
// });

// // const port = process.env.PORT;
// const server = app.listen(5, function () {
//   let host = server.address().address;
//   let port = server.address().port;
//   console.log("App listening on port", host, port);
// });

