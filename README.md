# nodemailer-relay
Relay SMTP using nodemailer

### About

This library adds a `relay` method to nodemailer to send email using the target domain's
SMTP servers. It looks up MX records and attempts to send mail to each prioritized server
until it either sends successfully, runs out of servers to try, or has a fatal send error
on a valid server.

### Example

```js
import nodemailer from 'nodemailer-relay'l

nodemailer.relay({
  mail: {
    from: 'foo@bar.com',
    to: 'baz@qux.com',
    cc: 'baz@bar.com'
  },
  transport: {
    // transport options
  }
}, (err, info) => {
  return err ?
    console.error(err) :
    console.log(info);
});
```

### API

#### `relay(options[, callback])`

Sends a message using the SMTP servers for each email address domain

`options`
* `mail` - Required, [nodemailer message options](https://nodemailer.com/message/)
* `transport` - Optional, [nodemailer transport options](https://nodemailer.com/smtp/)
