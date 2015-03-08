/*jslint node:true */
/*global unescape, escape */
var mailer = require('nodemailer');


module.exports = function(turl) {
  var url = require('url').parse(turl||"", true), transport, host, port, auth, from, protocol, sysopts,
  parts, domain, secure;
  // do we have a proper URL?
  url.protocol = url.protocol || "smtp:";
  url.host = url.host || "localhost";
  url.port = url.port || "25";
  url.path = url.path || "/localhost/"+escape("local@localhost");
  
  protocol = url.protocol.replace(/:$/,"").toUpperCase();
  host = url.host.split(":")[0];
  port = parseInt(url.port,10);
  parts = url.path.split(/\//);
  domain = parts[1];
  secure = url.query['secureConnection'] || false;
  from = unescape(parts[2]);
  sysopts = { host: host, port:port, name: domain, secureConnection: secure };
  if (url.auth) {
    auth = url.auth.split(":");
    sysopts.auth = {user:auth[0],pass:auth[1]};
  }

  // create reusable transport method (opens pool of SMTP connections)
  // nodemailer 1.3 allows gmail to be set as a service
  //transport = mailer.createTransport(protocol,sysopts);
	transport = mailer.createTransport({
        service: 'gmail',
        auth: {
            user: auth[0],
            pass: auth[1]
        }
    });
  return function(to,subject,body,cb) {
    var opts = {
      from: from,
      to: to,
      subject: subject,
      text: body
    };
    transport.sendMail(opts,cb);
  };
};
