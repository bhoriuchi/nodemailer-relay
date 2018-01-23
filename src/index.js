import _ from 'lodash';
import nodemailer from 'nodemailer';
import dns from 'dns';

const SMTP_PORT = 25;

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
  const resolves = _.map(domainMap, (data, domain) => {
    return resolveMxAsync(domain).then(addresses => {
      data.mx = _.sortBy(addresses, [ 'priority' ]);
    });
  });
  return Promise.all(resolves).then(() => domainMap);
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
function sendMail(
  addr,
  to,
  cc,
  mailOpts,
  relayOpts,
  mx,
  sendInfo,
  resolve,
  reject
) {
  if (!mx.length) {
    sendInfo.push('failed to send to: ' + to);
    return resolve();
  }
  const host = mx.shift();

  const transporter = nodemailer.createTransport(
    _.merge({ port: SMTP_PORT }, relayOpts, {
      host: host.exchange
    })
  );

  transporter.sendMail(
    _.merge({}, mailOpts, {
      to,
      cc,
      bcc: null
    }),
    (err, info) => {
      if (err) {
        if (err.message.match(/ENOTFOUND/)) {
          return sendMail(
            addr,
            to,
            cc,
            mailOpts,
            relayOpts,
            mx,
            sendInfo,
            resolve,
            reject
          );
        }
        sendInfo.push({ to, info: err.message });
        return reject();
      }
      sendInfo.push({ to, info });
      return resolve();
    }
  );
}

/**
 * Main method for sending a relay message
 * @param {*} relayOptions
 * @param {*} callback
 */
function relay(relayOptions, callback) {
  const cb = _.isFunction(callback) ? callback : _.noop;

  try {
    const opts = Object.assign({}, relayOptions);
    const mailOpts = Object.assign({}, opts.mail);
    const relayOpts = Object.assign({}, opts.transport);
    const sendInfo = [];
    const domainMap = {};
    const from = mailOpts.from;

    // get to and cc addresses for the header
    const to = toArray(mailOpts.to).join(', ');
    const cc = toArray(mailOpts.cc).join(', ');

    // map the email addresses to their domains
    mapDomains(mailOpts.to, domainMap);
    mapDomains(mailOpts.cc, domainMap);
    mapDomains(mailOpts.bcc, domainMap);

    // lookup mx records for each domain asynchronously
    lookupMx(domainMap).then(results => {
      const domains = _.map(results, ({ addrs, mx }) => {
        const sends = _.map(addrs, addr => {
          return new Promise((resolve, reject) => {
            const o = _.merge({}, mailOpts, {
              envelope: { from, to: addr, cc: '', bcc: '' }
            });
            sendMail(
              addr,
              to,
              cc,
              o,
              relayOpts,
              _.clone(mx),
              sendInfo,
              resolve,
              reject
            );
          });
        });
        return Promise.all(sends);
      });
      return Promise.all(domains);
    })
    .then(() => {
      return cb(undefined, sendInfo);
    })
    .catch(cb);
  } catch (relayErr) {
    return cb(relayErr);
  }
}

/**
 * Extend the nodemailer instance with the relay method
 */
export default Object.assign({}, nodemailer, { relay });
