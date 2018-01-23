import nodemailer from '../index';

nodemailer.relay({
  mail: {
    from: 'bhoriuchi@gmail.com',
    to: 'bhoriuchi@gmail.com',
    subject: 'test forward',
    text: 'message body'
  }
}, (err, info) => {
  if (err) {
    return console.log(err);
  }
  console.log(JSON.stringify(info, null, '  '));
});
