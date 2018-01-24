import _ from 'lodash';
import nodemailer from 'nodemailer';
import dns from 'dns';

const SMTP_PORT = 25;

/**
 * Simple debugging method
 * @param {*} message
 */
function debug(message) {
  if (process.env.DEBUG_NODEMAILER_RELAY) {
    process.stdout.write(JSON.stringify(message, null, '  ') + '\n\n');
  }
}

/**
 * Collection map using Promise
 * @param {*} collection
 * @param {*} iteratee
 */
function promiseMap(collection, iteratee) {
  const mapResult = [];
  return Promise.all(
    _.map(collection, (value, key) => {
      try {
        return Promise.resolve(iteratee(value, key, collection))
          .then(result => {
            mapResult[key] = result;
          });
      } catch (err) {
        return Promise.reject(err);
      }
    })
  )
  .then(() => mapResult);
}

/**
 * resolveMx using promises
 * @param {*} hostname
 */
function resolveMxAsync(hostname) {
  return new Promise((resolve, reject) => {
    try {
      dns.resolveMx(hostname, (resolveErr, addresses) => {
        return resolveErr ? reject(resolveErr) : resolve(addresses);
      });
    } catch (err) {
      return reject(err);
    }
  });
}

/**
 * Converts a to line to an array of email addresses
 * @param {*} value
 */
function toArray(value) {
  return Array.isArray(value) ?
    value.map(v => v.trim()) :
    typeof value === 'string' ?
      value.split(',').map(v => v.trim().toLowerCase()) :
      [];
}

/**
 * Creates a map of domain names to email addresses
 * @param {*} addr
 * @param {*} domainMap
 */
function mapDomains(addr, domainMap) {
  toArray(addr).forEach(emailAddr => {
    const domain = emailAddr.replace(/^.*@/, '').toLowerCase();
    domainMap[domain] = {
      addrs: domainMap[domain] ?
        _.union(domainMap[domain].addrs, [ emailAddr.toLowerCase() ]) :
        [ emailAddr.toLowerCase() ]
    };
  });
  return domainMap;
}

/**
 * Looks up mx records for a domain
 * @param {*} domainMap
 */
function lookupMx(domainMap) {
  return Promise.all(
    _.map(domainMap, (data, domain) => {
      return resolveMxAsync(domain).then(addresses => {
        data.mx = _.sortBy(addresses, [ 'priority' ]);
      });
    })
  ).then(() => domainMap);
}

/**
 * Performs the mail send by iterating through each mx record
 * and attempting to send until message is sent
 * @param {*} addr
 * @param {*} to
 * @param {*} cc
 * @param {*} mailOpts
 * @param {*} relayOpts
 * @param {*} mx
 * @param {*} sendInfo
 * @param {*} resolve
 * @param {*} reject
 */
function sendMail(mail, transportOptions, mx, summary, resolve) {
  const to = _.get(mail, 'envelope.to');
  if (!mx.length) {
    summary.push('failed to send to: ' + to);
    return resolve();
  }
  const host = _.get(mx.shift(), 'exchange');
  const transporter = nodemailer.createTransport(
    _.merge({ port: SMTP_PORT }, transportOptions, { host })
  );

  transporter.sendMail(mail, (error, info) => {
    if (error) {
      debug({ sendError: error });
      if (!error.message.match(/ENOTFOUND/)) {
        summary.push({ to, info: error });
        return resolve(); // stop trying to process if an email error
      }
      return sendMail(mail, transportOptions, mx, summary, resolve);
    }
    summary.push({ to, info });
    return resolve();
  });
}

/**
 * Calls sendMail and returns a promise
 * @param {*} mail
 * @param {*} transportOptions
 * @param {*} mx
 * @param {*} summary
 */
function send(mail, transportOptions, mx, summary) {
  debug({
    sending: {
      mail,
      transportOptions
    }
  });
  return new Promise(resolve => {
    sendMail(mail, transportOptions, mx, summary, resolve);
  });
}

/**
 * Relay method to send a mail using SMTP relays that are looked up
 * using mx records
 * @param {*} mailOptions
 * @param {*} transportOptions
 * @param {*} callback
 */
function relay(mailOptions, transportOptions, callback) {
  let topts = transportOptions;
  let cb = callback;

  if (_.isFunction(topts)) {
    cb = topts;
    topts = {};
  }

  topts = Object.assign({}, topts);
  cb = _.isFunction(cb) ? cb : _.noop;

  return new Promise((resolve, reject) => {
    try {
      if (!_.isPlainObject(mailOptions)) {
        const moptsErr = new Error('mailOptions should be an object');
        cb(moptsErr);
        return reject(moptsErr);
      }

      const summary = [];
      const domainMap = {};
      const from = mailOptions.from;

      // get to and cc addresses for the header
      const to = toArray(mailOptions.to).join(', ');
      const cc = toArray(mailOptions.cc).join(', ');

      // map the email addresses to their domains
      mapDomains(mailOptions.to, domainMap);
      mapDomains(mailOptions.cc, domainMap);
      mapDomains(mailOptions.bcc, domainMap);

      // look up the domain map mx records
      return lookupMx(domainMap).then(dmap => {
        return promiseMap(dmap, ({ addrs, mx }, domain) => {
          debug({ addrs, mx, domain });
          const tOpts = _.find(transportOptions, (opts, name) => {
            return _.toLower(name) === _.toLower(domain);
          }) || {};

          return promiseMap(addrs, addr => {
            const mail = _.merge({}, mailOptions, {
              to,
              cc,
              bcc: '',
              envelope: {
                from,
                to: addr,
                cc: '',
                bcc: ''
              }
            });
            return send(mail, tOpts, mx, summary);
          });
        });
      })
      .then(() => {
        cb(null, summary);
        return resolve(summary);
      })
      .catch(err => {
        cb(err);
        return reject(err);
      });
    } catch (err) {
      cb(err);
      return reject(err);
    }
  });
}

/**
 * Extend the nodemailer instance with the relay method
 */
export default Object.assign({}, nodemailer, { relay });
