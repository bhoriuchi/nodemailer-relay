# nodemailer-relay
Relay SMTP using nodemailer

### About

This library adds a `relay` method to nodemailer to send email using the target domain's
SMTP servers. It looks up MX records and attempts to send mail to each prioritized server
until it either sends successfully, runs out of servers to try, or has a fatal send error
on a valid server.

**NOTE** `nodemailer` is a peer dependency so that you can use the most up to date version
which means it needs to be installed along with `nodemailer-relay`

### Installation

```bash
npm install --save nodemailer nodemailer-relay
```

### Example

```js
import nodemailer from 'nodemailer-relay';

nodemailer.relay({
  from: 'foo@bar.com',
  to: 'baz@qux.com',
  cc: 'baz@bar.com',
  subject: 'Foo',
  text: 'Bar Baz Qux'
}, {
  'qux.com': {
    port: 587,
    secure: false,
    auth: {
      user: 'username',
      password: 'password'
    }
  }
})
.then(info => {
  console.log(info);
});
```

### API

#### `relay(mailOptions[, transportOptions][, callback]) → Promise<info>`

**Parameters**

* `mailOptions` - Required, [nodemailer message options](https://nodemailer.com/message/)
* `transportOptions` - Optional, A map of domain name to [nodemailer transport options](https://nodemailer.com/smtp/) for that domain
* `callback` - Optional, An error first callback function that can be used instead of the returned Promise. The second argument is an array of info

**Returns**

`Promise<info>`

Where `info` is an object containing the `to` address and send `info` which may include errors

### Debugging

Some debug logging can be enabled by setting the environment variable `DEBUG_NODEMAILER_RELAY` to `"true"`
